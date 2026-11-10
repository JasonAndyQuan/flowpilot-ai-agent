# FlowPilot AI Agent

FlowPilot is a safety-first AI workspace agent. It turns natural-language requests into a constrained JSON action plan, validates every command, asks the user to review the plan, and then performs concrete actions in a persistent browser workspace.

## Why this problem matters

LLMs are good at suggesting what to do, but ordinary chat interfaces stop at text. FlowPilot closes that gap for common project-workspace tasks while making the execution boundary visible and auditable. It supports project and task operations, note creation, and file operations inside a safe virtual filesystem.

## Assignment requirements covered

| Requirement | FlowPilot implementation |
| --- | --- |
| LLM integration | OpenAI Chat Completions API with JSON mode, configurable model, timeout, retry, 429 and 5xx handling |
| Action interpreter | Allowlisted JSON DSL with nine commands, parameter validation, path sanitization, and a 12-action limit |
| Concrete execution | Persistent project/task/note operations plus create, move, overwrite, and delete operations in a virtual filesystem |
| User interface | Responsive web console for natural-language requests, plan review, status feedback, workspace inspection, and logs |
| Safety | Review before execution, explicit confirmation for deletes/overwrites, sandboxed file paths, blocked executable extensions, and undo snapshot |
| Auditability | Timestamped success/error/blocked records with JSON export |
| Prompt engineering | Role definition, command schema, security boundaries, few-shot example, context injection, and JSON-only output |

## Run locally

No build step or dependencies are required.

```bash
cd /Users/jason/repos/flowpilot-agent
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173`.

## Use the agent

1. Enter a request or select an example.
2. Click **Build action plan**.
3. Review the exact validated operations.
4. Click **Execute plan**. Destructive or overwriting operations require another confirmation.
5. Inspect the **Workspace** and **Audit log** tabs.

The default **Demo planner** works without credentials for reliable grading and demonstration. To use a real LLM, open **Model settings**, choose **OpenAI API**, and enter an API key. The key is retained only in `sessionStorage`; it is never saved in persistent local storage, source code, or logs.

## Test

```bash
npm test
```

The tests cover schema enforcement, prompt constraints, path traversal, executable-path rejection, cross-domain execution, dynamic overwrite risk, destructive-action blocking, confirmation, and audit logging.

## Action DSL

The LLM may emit only this envelope:

```json
{
  "summary": "Set up the Research project",
  "rationale": "The project must exist before its task can be added.",
  "actions": [
    { "type": "create_project", "params": { "name": "Research" } },
    { "type": "create_task", "params": { "title": "Collect sources", "project": "Research", "priority": "high" } }
  ]
}
```

Supported commands: `create_project`, `create_task`, `complete_task`, `delete_completed_tasks`, `create_note`, `create_file`, `move_file`, `delete_file`, and `summarize_workspace`.

## Architecture

```text
Natural-language request
          │
          ▼
 OpenAI or demo planner
          │  JSON action plan
          ▼
 Allowlist + schema validator
          │
          ▼
 Human review / confirmation
          │
          ▼
 Trusted action executor
       ┌──┴───────────┐
       ▼              ▼
 Project records   Virtual files
       └──────┬───────┘
              ▼
        Audit log + undo
```

More implementation detail is in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Deployment

The repository contains a Sites hosting manifest at `.openai/hosting.json`. The production artifact is the `dist/` directory.

## Privacy and limitations

- Workspace data stays in the current browser's local storage.
- File operations occur only in a virtual filesystem object, never on the visitor's device.
- OpenAI mode sends the request and a compact workspace inventory to the selected OpenAI model.
- The demo planner intentionally supports a smaller set of phrasing than a real LLM.
- This educational application is not intended for sensitive or regulated data.
