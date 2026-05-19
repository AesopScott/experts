# Mandatory Codex Backlog Workflow

These instructions apply to every future Codex session in this repository.

Whenever Scott references a backlog item by number, title, status, or location, ShipTask is the controlling workflow for Codex. This includes requests such as "work on backlog task #1", "finish task #1", "pick up the build-finished task", or any similar backlog-driven instruction.

Codex must not make code, content, configuration, documentation, or backlog-status changes for that item until it has invoked or manually followed ShipTask.

1. Read the relevant `docs/backlog.json` before selecting, starting, editing, or completing backlog work.
2. Run `/ship-task {number}` before making changes for the backlog item. The source of truth is `C:\Users\scott\.claude\commands\ship-task.md`.
3. If the slash command is not directly executable in the current host, follow the command document manually and preserve its gates, state transitions, planning requirements, proof units, and handoff rules.
4. Do not skip directly from a `backlog` task to implementation. A `backlog` task must go through `/plan-task {number}` first.
5. If a task workflow is already out of order, stop and make the recovery explicit before continuing. Do not pretend ShipTask ran.
6. If ShipTask blocks on a human gate, Codex must pause and ask for the required confirmation instead of proceeding around the gate.
