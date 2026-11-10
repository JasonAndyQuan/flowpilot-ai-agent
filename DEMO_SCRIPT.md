# 1–2 Minute Demo Script

## 0:00–0:15 — Problem and architecture

“FlowPilot solves the gap between an LLM suggesting work and an agent safely doing it. A planner converts my request into a small JSON command language. A separate validator and executor perform only supported actions.”

Show the command screen and point out **Safety layer active**.

## 0:15–0:45 — Plan and execute

Choose **Plan a class project**, then click **Build action plan**.

“The agent proposes three concrete operations: create a project, add a dated high-priority task, and save a note. The model does not execute anything directly. I can inspect every command first.”

Click **Execute 3 actions**, then show the Workspace tab.

## 0:45–1:10 — Safety

Return to Command, choose **Try a destructive action**, and build the plan.

“Deletes are labeled for confirmation. When I execute, FlowPilot explains exactly what can be removed and requires explicit approval.”

Cancel once to show no change, then execute again and confirm.

## 1:10–1:30 — Auditability and LLM integration

Open **Audit log**.

“Every success, failure, or blocked action is timestamped and exportable. The demo planner makes grading reliable without credentials; Model settings also connects to the real OpenAI API with JSON mode, timeout, and rate-limit retries. API keys stay only in session memory.”

End on the audit log or architecture section of the README.
