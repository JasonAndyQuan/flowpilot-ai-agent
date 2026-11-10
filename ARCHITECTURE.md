# Architecture and Safety Design

## Modules

### Planner integration

`dist/app.js` sends a role prompt, allowlisted command schema, security rules, a few-shot example, and compact workspace context to the OpenAI Chat Completions API. It requests JSON mode with a low temperature. Network handling includes a 35-second timeout and bounded exponential retry for rate limits and transient server errors.

The included deterministic demo planner uses the same output schema, so the interface can be tested without API credentials.

### Action interpreter

`dist/agent-core.js` treats all model output as untrusted. `validatePlan()` rejects malformed envelopes, unknown commands, incorrect parameter types, unsafe dates, paths outside the virtual workspace, executable extensions, and plans over 12 actions. It reconstructs every accepted action instead of passing through arbitrary model fields.

### Executor

The executor receives only validated actions. It supports two domains:

1. Project data: projects, tasks, completion status, notes, and summaries.
2. Virtual file management: create, move, replace, and delete.

Every operation produces a success, error, or blocked audit record. A failed operation does not crash later actions. The state is persisted in browser local storage.

### Safety boundary

- The model never executes code directly.
- Unknown action types are rejected.
- Paths must be relative and cannot contain `..` or executable extensions.
- Deletes are always destructive. File writes/moves become destructive when they overwrite an existing destination.
- Destructive plans require explicit confirmation after the plan-review step.
- A pre-run snapshot supports one-click undo.
- API keys are stored only in session storage and are excluded from model context and logs.
- DOM rendering uses `textContent` for untrusted values.

## Data flow

1. The user describes an outcome.
2. The planner returns a JSON DSL plan.
3. The interpreter reconstructs and validates supported actions.
4. The UI displays the plan and risk labels.
5. The user executes and, when needed, confirms destructive actions.
6. The executor updates the browser workspace and records each result.

## Prompt-engineering techniques

- A specific planner role and separation between planning and execution.
- Explicit security instructions and prompt-injection resistance.
- A closed action vocabulary with parameter contracts.
- A strict JSON envelope and JSON-mode API request.
- A few-shot example demonstrating action order.
- Compact grounding context for existing tasks and files.
- A minimal-action instruction to reduce unnecessary side effects.

## Threat model

The main threats are malformed model output, prompt injection, path traversal, excessive action generation, destructive operations without informed consent, accidental overwrite, API failure, and accidental credential persistence. The controls above address each threat within the scope of a browser-based educational agent.
