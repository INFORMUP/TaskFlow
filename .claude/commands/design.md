---
description: Do design work on a TaskFlow task currently in the `design` status
argument-hint: "<task-id-or-display-id>"
---

# Design

Pick up a TaskFlow task in the `design` status, produce a design spec, post it as a comment, and (optionally) transition the task to `prototype`.

## Arguments

- `$ARGUMENTS` — task ID (UUID) or display ID (e.g. `FEAT-2`). If omitted, ask the user.

## Instructions

1. **Setup**
   - Read the API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`.

2. **Fetch the task**
   - If `$ARGUMENTS` looks like a UUID: `GET /api/v1/tasks/{id}`.
   - Otherwise treat it as a display ID and `GET /api/v1/tasks?flow=<flow-slug-guessed-from-prefix>` then match `displayId`. Prefix → flow: `FEAT` → `feature`, `BUG` → `bug`, `IMP` → `improvement`. (If unsure, list tasks and grep.)
   - Also fetch comments: `GET /api/v1/tasks/{id}/comments`.

3. **Verify status**
   - The task must be in `currentStatus.slug == "design"`. If not, stop and tell the user — this skill is only for tasks already moved into design (the product team owns the discuss → design transition).

4. **Read context**
   - Read the task description and every existing comment in full. Treat them as the source of truth — earlier discussion may already constrain the design. Note any imported-from GitHub link in the description and skim that issue too if it adds context.
   - Skim relevant code in the current checkout to ground the design in what's actually there. Layout varies by repo — read the project's CLAUDE.md or top-level README for entry points (e.g. for TaskFlow itself: `backend/src/`, `frontend/src/`, `backend/prisma/schema.prisma`). Do not start writing the spec without doing this.

5. **Produce the design spec** — a markdown comment with these sections (omit any that don't apply):
   - **Goal** — one or two sentences restating what this task is delivering and why.
   - **User stories** — `As a <role>, I want <capability> so that <outcome>.` Cover the main path and any non-obvious secondary paths.
   - **Acceptance criteria** — checkbox list of observable, testable conditions. Be concrete (HTTP codes, UI states, error messages).
   - **Technical approach** — backend changes (routes, services, schema), frontend changes (components, routes, state), data-model changes (new tables/columns/migrations). Reference actual file paths where possible.
   - **Out of scope** — explicit list of things this task will NOT do, to prevent scope creep.
   - **Open questions** — anything you couldn't resolve from the task + code alone. If empty, omit.

6. **Post the comment**
   - `POST /api/v1/tasks/{id}/comments` with `{"body": "<the spec>"}`. Requires `comments:write` scope.
   - The token user must be on a team allowed to comment on this flow — if you get 403, surface the error and stop.

7. **Offer transition**
   - Print the task URL: `https://taskflow.informup.org/tasks/<flow-slug>/<task-id>`.
   - Ask the user whether to transition the task to `prototype` (the next status in the `feature` flow). If yes:
     - `POST /api/v1/tasks/{id}/transitions` with `{"toStatus": "prototype"}`. The design spec comment is the signal — no transition note needed.
     - Note: prototype requires the `engineer` or `agent` team. If the token user lacks this, surface the 403 and ask them to do it manually.
   - If they say no, stop — leaving the task in `design` for further review.

## Notes

- **Read before writing.** A shallow design spec is worse than none — it pollutes the task with noise that future agents have to wade through. If you can't ground a section in real context, leave it out or list it as an open question.
- **Don't transition to `discuss`.** If the task seems ill-defined, post the spec with open questions and leave the task in `design` — the product team can decide whether to bounce it back.
- **One comment, not several.** Post the full spec as a single comment so it's easy to find and reference.
