---
description: Create a new task in TaskFlow (taskflow.informup.org) — not a GitHub issue
argument-hint: "<task title>"
---

# Create Task

Create a new task in TaskFlow at taskflow.informup.org. **Do not** create a GitHub issue — this project tracks work in TaskFlow, not GitHub Issues.

## Arguments

- `$ARGUMENTS` — the task title. If omitted, ask the user for one.

## Instructions

1. **Title**: use `$ARGUMENTS` verbatim if non-empty; otherwise ask the user.

2. **Description**: ask the user for a description (problem / proposal / acceptance, freeform). If they say "skip" or give nothing, create with title only.

3. **Flow**: default to `feature`. If the title clearly suggests otherwise (`bug`, `improvement`), confirm with the user before switching. Available slugs: `feature`, `bug`, `improvement` (and others — list via `GET /api/v1/flows` if needed).

4. **Project**: default to the Taskflow project (`3699c368-ddaf-4233-a569-05d78b0b4d0d`). Don't ask unless the user has set up other projects since this skill was written.

5. **Token**: read from `~/.taskflow-import-token` (chmod 600). Do not log the token.

6. **Create**: POST to `https://taskflow.informup.org/api/v1/tasks` with body:
   ```json
   {
     "flow": "<flow-slug>",
     "title": "<title>",
     "description": "<description-or-omitted>",
     "projectIds": ["<project-uuid>"]
   }
   ```
   Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`.

7. **Report**: print the new task URL: `https://taskflow.informup.org/tasks/<flow-slug>/<task-id>`.

## Notes

- If the user explicitly asks for a GitHub issue instead, push back once ("this project uses TaskFlow for issue tracking") and only fall back to `gh issue create` if they confirm.
- If creation fails with `FLOW_NOT_IN_PROJECTS`, the project doesn't have that flow attached — surface the error and ask whether to attach it via `POST /api/v1/projects/{id}/flows`.
