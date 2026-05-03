---
description: Create a new task in TaskFlow (taskflow.informup.org) — not a GitHub issue
argument-hint: "<task title or prompt>"
---

# Create Task

Create a new task in TaskFlow at taskflow.informup.org. **Do not** create a GitHub issue — this project tracks work in TaskFlow, not GitHub Issues.

## Arguments

- `$ARGUMENTS` — either a literal task title OR a freeform prompt describing the task to create (e.g. "investigate the flaky login test", "the bug we just hit with stale cache"). If omitted, ask the user.

## Instructions

1. **Title**: decide whether `$ARGUMENTS` reads like a self-contained title or like a prompt/instruction/reference to prior context.
   - **Self-contained title** (e.g. "Add dark mode toggle", "Fix 500 on /api/v1/tasks export"): use it verbatim.
   - **Prompt-like** (sentence fragment, instruction, references "this"/"the bug we just hit"/"that thing"): synthesize a proper title and a draft description from the surrounding conversation context. Show both to the user for confirmation before creating.
   - If `$ARGUMENTS` is empty, ask the user.

2. **Description**: if you didn't already synthesize one in step 1, ask the user for a description (problem / proposal / acceptance, freeform). If they say "skip" or give nothing, create with title only.

3. **Flow**: default to `feature`. If the title clearly suggests otherwise (`bug`, `improvement`), confirm with the user before switching. Available slugs: `feature`, `bug`, `improvement` (and others — list via `GET /api/v1/flows` if needed).

4. **Project**: default to the Taskflow project. Resolve its UUID at runtime via `GET /api/v1/projects?slug=taskflow` and read `data[0].id` — don't hardcode the UUID, since reseeds can change it. If the lookup returns zero results, stop and surface the error.

5. **Token**: read from `~/.taskflow-import-token` (chmod 600). Do not log the token.

6. **Create**: POST to `https://taskflow.informup.org/api/v1/tasks` with body:
   ```json
   {
     "flow": "<flow-slug>",
     "title": "<title>",
     "description": "<description-or-omitted>",
     "projectIds": ["<project-uuid>"],
     "spawnedFromTaskId": "<parent-task-uuid-or-omitted>"
   }
   ```
   Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`.

   `spawnedFromTaskId` is optional. Set it when the new task is a follow-up
   spawned from existing work (e.g. an `/address-review` Defer triage). The
   parent must be visible to the caller; otherwise the API returns
   `404 SPAWNED_FROM_NOT_FOUND`.

7. **Report**: print the new task URL: `https://taskflow.informup.org/tasks/<flow-slug>/<task-id>`.

## Notes

- If the user explicitly asks for a GitHub issue instead, push back once ("this project uses TaskFlow for issue tracking") and only fall back to `gh issue create` if they confirm.
- If creation fails with `FLOW_NOT_IN_PROJECTS`, the project doesn't have that flow attached — surface the error and ask whether to attach it via `POST /api/v1/projects/{id}/flows`.
