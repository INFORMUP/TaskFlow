# Phase 2.4 — Claude Code Skill

**Goal:** Engineers can drive TaskFlow from the terminal via a Claude Code skill, using an API token from Phase 2.1.

**Depends on:** Phase 2.1 (token auth). Benefits from 2.3 (web UI for token creation) but can ship without it — users can create tokens via curl in the interim.

## Skill commands

- `taskflow status <task_id>` — print task summary: title, flow, status, assignee, project(s), due date.
- `taskflow list [--mine] [--project <key>] [--status <slug>] [--flow <slug>]` — list tasks with the same filter vocabulary as the web list view.
- `taskflow transition <task_id> <status> --note <text> [--resolution <slug>]` — create a transition. Required note, required resolution on close.
- `taskflow create bug|feature|improvement --title <text> --project <key> [--assignee <user>] [--description <text>]` — create a task with the Phase 1.1 required-field set.

## Auth

- Token stored in `~/.config/taskflow/credentials.toml` (or equivalent per-OS config path), read-only perms (0600).
- First-run flow: `taskflow auth` prompts for token paste; writes the file with correct perms; tests by calling `GET /api/v1/auth/tokens`.
- Environment override: `TASKFLOW_TOKEN` env var takes precedence over the config file, for CI use.

## Output

- Human-readable default. `--json` flag emits raw response for piping.
- Non-zero exit codes on API errors, with stderr carrying the API error message.

## Tests

- Command parsing, auth file permissions and precedence, error mapping from HTTP status to exit code, JSON mode fidelity.

## What this validates

- Do engineers actually reach for the CLI, or do they stay in the web UI?
- Is the command surface the right shape, or do we need `taskflow edit`, `taskflow comment`, etc.?
