# Prompts — Agent Instructions

Standalone tasks written to be handed to an agent and executed in a single session. Unlike `build-plan/`, these carry no product hypothesis and are not phased — they exist to track tooling, chores, and one-off work.

## Workflow

1. Pick a prompt from this directory. Each file is self-contained; read it and execute it.
2. When finished, **move the file to `archive/` and prepend the completion date to the filename** using the format `YYYY-MM-DD-<original-name>.md`.
   - Example: `frontend-test-runner.md` → `archive/2026-04-16-frontend-test-runner.md`.
3. Inside the archived file, add a `**Completed:** YYYY-MM-DD.` line immediately after the top-level heading, followed by a one- or two-line note on what shipped (commit SHA or PR is ideal).
4. Do not delete prompts after completion — the archive is the record that the work happened.

Do not archive a prompt until its work is landed on `main` (or the user has explicitly confirmed it's shipped).
