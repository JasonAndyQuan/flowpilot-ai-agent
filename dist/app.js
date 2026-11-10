import {
  ACTION_DEFINITIONS,
  STORAGE_KEY,
  buildDemoPlan,
  buildSystemPrompt,
  createInitialState,
  deepClone,
  executePlan,
  isActionDestructive,
  migrateWorkspace,
  validatePlan,
} from "./agent-core.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  requestInput: $("#request-input"),
  composer: $("#agent-composer"),
  planButton: $("#plan-button"),
  charCount: $("#char-count"),
  planPanel: $("#plan-panel"),
  planSummary: $("#plan-summary"),
  planRationale: $("#plan-rationale"),
  planList: $("#plan-list"),
  executePlan: $("#execute-plan"),
  discardPlan: $("#discard-plan"),
  settingsDialog: $("#settings-dialog"),
  confirmDialog: $("#confirm-dialog"),
  apiFields: $("#api-fields"),
  apiKey: $("#api-key"),
  modelName: $("#model-name"),
  activeModelLabel: $("#active-model-label"),
  toastRegion: $("#toast-region"),
};

let workspace = loadWorkspace();
let currentPlan = null;
let currentPlanSource = "demo-planner";
let plannerSettings = loadPlannerSettings();

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.notes) || !parsed.files || !Array.isArray(parsed.audit)) throw new Error("Invalid stored state");
    const migrated = migrateWorkspace(parsed);
    if (migrated.version !== parsed.version) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return createInitialState();
  }
}

function persistWorkspace() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

function loadPlannerSettings() {
  const planner = localStorage.getItem("flowpilot.planner") === "openai" ? "openai" : "demo";
  const model = localStorage.getItem("flowpilot.model") || "gpt-4o-mini";
  return { planner, model, apiKey: sessionStorage.getItem("flowpilot.apiKey") || "" };
}

function savePlannerSettings() {
  localStorage.setItem("flowpilot.planner", plannerSettings.planner);
  localStorage.setItem("flowpilot.model", plannerSettings.model);
  if (plannerSettings.apiKey) sessionStorage.setItem("flowpilot.apiKey", plannerSettings.apiKey);
  else sessionStorage.removeItem("flowpilot.apiKey");
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch { return value; }
}

function toast(message, type = "success") {
  const node = el("div", `toast${type === "error" ? " error" : ""}`, message);
  elements.toastRegion.append(node);
  window.setTimeout(() => node.remove(), 4200);
}

function switchView(view) {
  $$(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  $$("[data-view-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.viewPanel === view));
  const titles = { command: "Command center", workspace: "Workspace", audit: "Audit log" };
  $("#view-title").textContent = titles[view];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderMetrics() {
  $("#metric-projects").textContent = workspace.projects.length;
  $("#metric-tasks").textContent = workspace.tasks.filter((task) => !task.completed).length;
  $("#metric-notes").textContent = workspace.notes.length;
  $("#metric-files").textContent = Object.keys(workspace.files).length;
  $("#audit-count").textContent = workspace.audit.length;
  elements.activeModelLabel.textContent = plannerSettings.planner === "openai" ? plannerSettings.model : "Demo planner";

  const recent = workspace.audit.slice(0, 3);
  const mini = $("#mini-activity");
  mini.replaceChildren();
  if (!recent.length) mini.append(el("div", "empty-mini", "Agent actions will appear here."));
  recent.forEach((entry) => {
    const row = el("div", "mini-row");
    row.append(el("span", "mini-status"));
    const copy = el("div");
    copy.append(el("strong", "", entry.detail));
    copy.append(el("small", "", `${entry.action} · ${formatTime(entry.time)}`));
    row.append(copy);
    mini.append(row);
  });
  $("#last-run-time").textContent = recent[0] ? formatTime(recent[0].time) : "No runs yet";
}

function renderTasks() {
  const container = $("#task-list");
  container.replaceChildren();
  $("#task-count").textContent = `${workspace.tasks.length} total`;
  if (!workspace.tasks.length) return container.append(el("div", "empty-state", "No tasks yet."));
  workspace.tasks.forEach((task) => {
    const row = el("div", "data-row");
    row.append(el("span", `check-mark${task.completed ? " done" : ""}`, task.completed ? "✓" : ""));
    const copy = el("div");
    const title = el("strong", "", task.title);
    if (task.completed) title.style.textDecoration = "line-through";
    copy.append(title, el("small", "", `${task.project || "Inbox"} · ${task.completed ? "Completed" : "Open"}`));
    const meta = el("div", "row-meta");
    meta.append(el("small", task.priority === "high" ? "priority-high" : "", task.priority.toUpperCase()));
    if (task.due) meta.append(el("small", "", `Due ${task.due}`));
    row.append(copy, meta);
    container.append(row);
  });
}

function renderNotes() {
  const container = $("#note-list");
  container.replaceChildren();
  $("#note-count").textContent = `${workspace.notes.length} total`;
  if (!workspace.notes.length) return container.append(el("div", "empty-state", "No notes yet."));
  workspace.notes.forEach((note, index) => {
    const row = el("div", "data-row");
    const swatch = el("span", "note-swatch");
    swatch.style.background = ["#f7bf52", "#67db99", "#70a7ff", "#ff8c79"][index % 4];
    const copy = el("div");
    copy.append(el("strong", "", note.title), el("small", "", note.content.length > 100 ? `${note.content.slice(0, 100)}…` : note.content));
    row.append(swatch, copy, el("small", "row-meta", note.project || "Inbox"));
    container.append(row);
  });
}

function renderFiles() {
  const container = $("#file-list");
  container.replaceChildren();
  const files = Object.entries(workspace.files).sort(([a], [b]) => a.localeCompare(b));
  $("#file-count").textContent = `${files.length} total`;
  if (!files.length) return container.append(el("div", "empty-state", "No virtual files yet."));
  files.forEach(([path, content]) => {
    const row = el("div", "file-row");
    row.append(el("span", "", "◇"), el("span", "", path), el("small", "", `${new Blob([content]).size} B`));
    container.append(row);
  });
}

function renderAudit() {
  const body = $("#audit-body");
  body.replaceChildren();
  if (!workspace.audit.length) {
    const row = el("tr");
    const cell = el("td", "empty-state", "No actions have been executed yet.");
    cell.colSpan = 5;
    row.append(cell);
    return body.append(row);
  }
  workspace.audit.forEach((entry) => {
    const row = el("tr");
    row.append(el("td", "", formatTime(entry.time)));
    const statusCell = el("td");
    statusCell.append(el("span", `status-chip${entry.status === "error" ? " error" : entry.status === "blocked" ? " blocked" : ""}`, entry.status));
    row.append(statusCell, el("td", "", entry.action), el("td", "audit-detail", entry.detail), el("td", "", entry.source));
    body.append(row);
  });
}

function renderAll() {
  renderMetrics();
  renderTasks();
  renderNotes();
  renderFiles();
  renderAudit();
  $("#undo-button").disabled = !workspace.lastSnapshot;
}

function renderPlan(plan) {
  elements.planSummary.textContent = plan.summary;
  elements.planRationale.textContent = plan.rationale;
  elements.planList.replaceChildren();
  plan.actions.forEach((action, index) => {
    const destructive = isActionDestructive(action, workspace);
    const row = el("article", "plan-step");
    row.append(el("span", "step-number", String(index + 1).padStart(2, "0")));
    row.append(el("span", "step-action", ACTION_DEFINITIONS[action.type].label));
    row.append(el("span", "step-description", action.description));
    row.append(el("span", destructive ? "risk-badge" : "safe-badge", destructive ? "CONFIRM" : "VALIDATED"));
    elements.planList.append(row);
  });
  elements.executePlan.textContent = `Execute ${plan.actions.length} action${plan.actions.length === 1 ? "" : "s"} →`;
  elements.planPanel.classList.remove("is-hidden");
  elements.planPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setPlanning(isPlanning) {
  elements.planButton.disabled = isPlanning;
  elements.planButton.querySelector("span").textContent = isPlanning ? "Planning…" : "Build action plan";
}

function extractModelJson(content) {
  if (typeof content !== "string") throw new Error("The model returned an empty response.");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); }
  catch { throw new Error("The model did not return valid JSON. Please retry."); }
}

async function fetchWithRetry(url, options, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.ok) return response;
      const payload = await response.json().catch(() => ({}));
      const message = payload?.error?.message || `OpenAI API returned ${response.status}.`;
      if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 700 * 2 ** (attempt - 1);
        await new Promise((resolve) => window.setTimeout(resolve, Math.min(delay, 5000)));
        continue;
      }
      throw new Error(message);
    } catch (error) {
      lastError = error;
      if (error?.name === "AbortError") lastError = new Error("The model request timed out after 35 seconds.");
      if (attempt < maxAttempts && error instanceof TypeError) {
        await new Promise((resolve) => window.setTimeout(resolve, 700 * 2 ** (attempt - 1)));
        continue;
      }
      throw lastError;
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError || new Error("Model request failed.");
}

async function planWithOpenAI(request) {
  if (!plannerSettings.apiKey) throw new Error("Add an OpenAI API key in Model settings first.");
  const response = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${plannerSettings.apiKey}` },
    body: JSON.stringify({
      model: plannerSettings.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(workspace) },
        { role: "user", content: request },
      ],
    }),
  });
  const payload = await response.json();
  return validatePlan(extractModelJson(payload?.choices?.[0]?.message?.content));
}

async function handlePlanRequest(event) {
  event.preventDefault();
  const request = elements.requestInput.value.trim();
  if (!request) return toast("Describe a workspace outcome first.", "error");
  setPlanning(true);
  try {
    currentPlanSource = plannerSettings.planner === "openai" ? `openai:${plannerSettings.model}` : "demo-planner";
    currentPlan = plannerSettings.planner === "openai" ? await planWithOpenAI(request) : buildDemoPlan(request, workspace);
    renderPlan(currentPlan);
    toast(`Plan validated: ${currentPlan.actions.length} supported action${currentPlan.actions.length === 1 ? "" : "s"}.`);
  } catch (error) {
    currentPlan = null;
    elements.planPanel.classList.add("is-hidden");
    toast(error instanceof Error ? error.message : "Could not create a plan.", "error");
  } finally {
    setPlanning(false);
  }
}

function confirmDestructive(actions) {
  const dangerList = $("#danger-list");
  dangerList.replaceChildren();
  actions.forEach((action) => dangerList.append(el("div", "", action.description)));
  $("#confirm-copy").textContent = `${actions.length} action${actions.length === 1 ? "" : "s"} can remove or replace data. FlowPilot will record the result and preserve one undo snapshot.`;
  elements.confirmDialog.showModal();
  return new Promise((resolve) => {
    elements.confirmDialog.addEventListener("close", () => resolve(elements.confirmDialog.returnValue === "confirm"), { once: true });
  });
}

async function handleExecute() {
  if (!currentPlan) return;
  const destructive = currentPlan.actions.filter((action) => isActionDestructive(action, workspace));
  let allowDestructive = false;
  if (destructive.length) {
    allowDestructive = await confirmDestructive(destructive);
    if (!allowDestructive) return toast("Execution canceled. No actions were taken.", "error");
  }
  elements.executePlan.disabled = true;
  const { state, results } = executePlan(currentPlan, workspace, { allowDestructive, source: currentPlanSource });
  workspace = state;
  persistWorkspace();
  renderAll();
  const successful = results.filter((result) => result.status === "success").length;
  const failed = results.filter((result) => result.status === "error").length;
  currentPlan = null;
  elements.planPanel.classList.add("is-hidden");
  elements.executePlan.disabled = false;
  toast(`${successful} action${successful === 1 ? "" : "s"} completed${failed ? `; ${failed} failed safely` : ""}.`, failed ? "error" : "success");
  switchView("workspace");
}

function openSettings() {
  $$('input[name="planner"]').forEach((radio) => { radio.checked = radio.value === plannerSettings.planner; });
  elements.modelName.value = plannerSettings.model;
  elements.apiKey.value = plannerSettings.apiKey;
  elements.apiFields.classList.toggle("is-visible", plannerSettings.planner === "openai");
  elements.settingsDialog.showModal();
}

function handleSaveSettings(event) {
  event.preventDefault();
  const planner = $('input[name="planner"]:checked').value;
  const apiKey = elements.apiKey.value.trim();
  if (planner === "openai" && !apiKey) return toast("Enter an API key or select Demo planner.", "error");
  plannerSettings = { planner, model: elements.modelName.value, apiKey };
  savePlannerSettings();
  elements.settingsDialog.close();
  renderMetrics();
  toast(planner === "openai" ? `Connected planner set to ${plannerSettings.model}.` : "Demo planner enabled.");
}

function undoLastRun() {
  if (!workspace.lastSnapshot) return;
  const currentAudit = workspace.audit;
  const restored = deepClone(workspace.lastSnapshot);
  restored.audit = [{ id: `audit_undo_${Date.now()}`, time: new Date().toISOString(), status: "success", action: "undo_last_run", detail: "Restored the workspace snapshot from before the last agent run.", source: "user" }, ...currentAudit].slice(0, 200);
  restored.lastSnapshot = null;
  workspace = restored;
  persistWorkspace();
  renderAll();
  toast("The previous agent run was undone.");
}

function exportAudit() {
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), application: "FlowPilot", entries: workspace.audit }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `flowpilot-audit-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function resetWorkspace() {
  if (!window.confirm("Reset the entire FlowPilot demo workspace? This clears local projects, tasks, notes, files, and logs.")) return;
  workspace = createInitialState();
  persistWorkspace();
  currentPlan = null;
  elements.planPanel.classList.add("is-hidden");
  renderAll();
  toast("Demo workspace reset.");
}

function bindEvents() {
  elements.composer.addEventListener("submit", handlePlanRequest);
  elements.requestInput.addEventListener("input", () => { elements.charCount.textContent = `${elements.requestInput.value.length} / 1200`; });
  $$(".suggestions button").forEach((button) => button.addEventListener("click", () => {
    elements.requestInput.value = button.dataset.prompt;
    elements.requestInput.dispatchEvent(new Event("input"));
    elements.requestInput.focus();
  }));
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  elements.discardPlan.addEventListener("click", () => { currentPlan = null; elements.planPanel.classList.add("is-hidden"); });
  elements.executePlan.addEventListener("click", handleExecute);
  $("#settings-button").addEventListener("click", openSettings);
  $("#save-settings").addEventListener("click", handleSaveSettings);
  $$('input[name="planner"]').forEach((radio) => radio.addEventListener("change", () => elements.apiFields.classList.toggle("is-visible", radio.value === "openai" && radio.checked)));
  $("#undo-button").addEventListener("click", undoLastRun);
  $("#export-log").addEventListener("click", exportAudit);
  $("#reset-button").addEventListener("click", resetWorkspace);
}

bindEvents();
renderAll();
