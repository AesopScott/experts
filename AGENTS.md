# Codex Backlog Workflow

When Scott asks Codex to work on a numbered backlog task, the backlog workflow is mandatory.

1. Read the relevant `docs/backlog.json` before selecting, starting, editing, or completing backlog work.
2. Run the `/ship-task {number}` workflow before making code changes. The source of truth is `C:\Users\scott\.claude\commands\ship-task.md`.
3. If the slash command is not directly executable in the current host, follow the command document manually and preserve its gates, state transitions, planning requirements, proof units, and handoff rules.
4. Do not skip directly from a `backlog` task to implementation. A `backlog` task must go through `/plan-task {number}` first.
5. If a task workflow is already out of order, stop and make the recovery explicit before continuing. Do not pretend the command ran.

