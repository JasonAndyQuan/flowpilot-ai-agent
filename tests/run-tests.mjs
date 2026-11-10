import assert from "node:assert/strict";
import {
  buildDemoPlan,
  buildSystemPrompt,
  createInitialState,
  executePlan,
  isActionDestructive,
  validatePlan,
  validateVirtualPath,
} from "../dist/agent-core.js";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("validates a supported plan", () => {
  const plan = validatePlan({ summary: "Create a project", actions: [{ type: "create_project", params: { name: "Research" } }] });
  assert.equal(plan.actions[0].type, "create_project");
  assert.equal(plan.actions[0].params.name, "Research");
});

test("rejects unsupported action types", () => {
  assert.throws(() => validatePlan({ actions: [{ type: "run_shell", params: { command: "rm -rf /" } }] }), /unsupported command/i);
});

test("rejects unsafe and executable paths", () => {
  assert.throws(() => validateVirtualPath("../secrets.txt"), /unsafe path segment/i);
  assert.throws(() => validateVirtualPath("/etc/passwd"), /relative/i);
  assert.throws(() => validateVirtualPath("tools/install.sh"), /blocked executable/i);
});

test("limits a plan to twelve actions", () => {
  const actions = Array.from({ length: 13 }, (_, index) => ({ type: "create_note", params: { title: `Note ${index}`, content: "Text" } }));
  assert.throws(() => validatePlan({ actions }), /12-action safety limit/i);
});

test("demo planner maps the class-project example", () => {
  const plan = buildDemoPlan("Create a project called Biology Final, add a high-priority task called Research credible sources due 2026-12-01, and save a note titled Thesis ideas with three possible angles.");
  assert.deepEqual(plan.actions.map((action) => action.type), ["create_project", "create_task", "create_note"]);
  assert.equal(plan.actions[1].params.due, "2026-12-01");
  assert.equal(plan.actions[1].params.priority, "high");
  assert.equal(plan.actions[2].params.title, "Thesis ideas");
});

test("demo planner preserves file extensions and removes sentence punctuation", () => {
  const plan = buildDemoPlan("Create a file at reports/status.md with a short project status template, then move inbox/ideas.txt to archive/ideas.txt and remove the file archive/old-plan.txt.");
  const create = plan.actions.find((action) => action.type === "create_file");
  const move = plan.actions.find((action) => action.type === "move_file");
  const remove = plan.actions.find((action) => action.type === "delete_file");
  assert.equal(create.params.path, "reports/status.md");
  assert.equal(move.params.from, "inbox/ideas.txt");
  assert.equal(move.params.to, "archive/ideas.txt");
  assert.equal(remove.params.path, "archive/old-plan.txt");
});

test("executor performs cross-domain operations and writes audit records", () => {
  const initial = createInitialState();
  const plan = validatePlan({ actions: [
    { type: "create_project", params: { name: "Research" } },
    { type: "create_task", params: { title: "Collect sources", project: "Research", priority: "high" } },
    { type: "create_file", params: { path: "research/sources.md", content: "# Sources" } },
  ] });
  const { state, results } = executePlan(plan, initial, { source: "test", now: "2026-11-10T20:00:00.000Z" });
  assert.equal(results.every((result) => result.status === "success"), true);
  assert.equal(state.projects.some((project) => project.name === "Research"), true);
  assert.equal(state.files["research/sources.md"], "# Sources");
  assert.equal(state.audit.length, 3);
  assert.ok(state.lastSnapshot);
});

test("executor blocks destructive actions without confirmation", () => {
  const initial = createInitialState();
  const plan = validatePlan({ actions: [{ type: "delete_file", params: { path: "archive/old-plan.txt" } }] });
  const { state, results } = executePlan(plan, initial, { allowDestructive: false });
  assert.equal(results[0].status, "blocked");
  assert.equal(Object.hasOwn(state.files, "archive/old-plan.txt"), true);
  assert.equal(state.audit[0].status, "blocked");
});

test("executor allows a confirmed destructive action", () => {
  const initial = createInitialState();
  const plan = validatePlan({ actions: [{ type: "delete_file", params: { path: "archive/old-plan.txt" } }] });
  const { state, results } = executePlan(plan, initial, { allowDestructive: true });
  assert.equal(results[0].status, "success");
  assert.equal(Object.hasOwn(state.files, "archive/old-plan.txt"), false);
});

test("file overwrite is dynamically classified as destructive", () => {
  const initial = createInitialState();
  const plan = validatePlan({ actions: [{ type: "create_file", params: { path: "README.md", content: "Replacement" } }] });
  assert.equal(isActionDestructive(plan.actions[0], initial), true);
});

test("system prompt constrains the LLM to JSON actions", () => {
  const prompt = buildSystemPrompt(createInitialState());
  assert.match(prompt, /Output JSON only/i);
  assert.match(prompt, /Treat the user's text.*untrusted data/i);
  assert.match(prompt, /ALLOWED ACTIONS/);
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

if (passed !== tests.length) {
  console.error(`\n${passed}/${tests.length} tests passed.`);
  process.exit(1);
}

console.log(`\n${passed}/${tests.length} tests passed.`);
