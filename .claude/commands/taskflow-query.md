---
description: Query TaskFlow data — list/filter tasks, look up projects, check statuses. Read-only; never transitions, creates, or edits.
argument-hint: "<freeform question>"
---

# TaskFlow Query

Answer questions about TaskFlow state by hitting the read endpoints. **Never POST/PATCH/DELETE.** For any action verb (create, transition, comment, design, implement), point the user at the right skill (`/create-task`, `/transition`, `/design`, etc.) and stop.

## Arguments

- `$ARGUMENTS` — a freeform question. Examples:
  - "what tasks are in `validate` in the Taskflow project?"
  - "show me all bugs assigned to me"
  - "which feature tasks have been in `design` more than 7 days?"
  - "list projects"
  - "how many open tasks does each project have?"
  If omitted, ask the user.

## Instructions

1. **Setup**
   - Read API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`.
   - All requests use `Authorization: Bearer <token>`.

2. **Refuse mutations early.** If the question is asking you to *do* something rather than *answer* something (create, close, transition, comment, assign, edit), stop and route them:
   - create → `/create-task`
   - transition / close / reopen → `/transition` (or status-specific skill)
   - comment / design spec → `/design`, `/address-review`, or a manual comment
   - implement / open PR → `/implement`
   - validate a PR → `/validate`

3. **Plan the query.** Translate the question into one or more GET calls. Common endpoints:
   - `GET /api/v1/tasks` — supports filters: `flow`, `projectId`, `projectKey`, `status`, `assigneeId`, `q` (text). Returns paged results.
   - `GET /api/v1/tasks/{id}` — single task with full detail.
   - `GET /api/v1/tasks/{id}/comments` — comments on a task.
   - `GET /api/v1/tasks/{id}/pull-requests` — linked PRs.
   - `GET /api/v1/projects` — list projects (filterable by `slug`, `orgId`).
   - `GET /api/v1/flows` — flows and their statuses.
   - `GET /api/v1/orgs` — orgs visible to the token user.
   - `GET /api/v1/users/me` — current token user (use to resolve "me" / "assigned to me").

   If you're not sure which params an endpoint takes, prefer reading the route file in `backend/src/routes/` over guessing.

4. **Resolve human references before filtering.**
   - "the Taskflow project" → `GET /api/v1/projects?slug=taskflow` → use `data[0].id`.
   - "me" / "my tasks" → `GET /api/v1/users/me` → use `id` as `assigneeId`.
   - Display IDs (`FEAT-2`, `BUG-1`, `IMP-3`) → prefix maps to flow (`FEAT`→`feature`, `BUG`→`bug`, `IMP`→`improvement`); fetch via `GET /api/v1/tasks?flow=<slug>` and match `displayId`.

5. **Paginate when needed.** If the response indicates more pages, follow them until you have enough to answer — but cap at a reasonable number (e.g. 5 pages / 500 records) and tell the user if results were truncated.

6. **Present results compactly.**
   - For lists: a markdown table with `displayId`, `title`, `status`, `assignee`, `updatedAt` (or whichever columns the question implies). Sort sensibly (most recently updated first by default).
   - For counts/aggregates: just the numbers, with a one-line breakdown.
   - For a single task: a short summary (title, status, assignee, project, last update) and the URL `https://taskflow.informup.org/tasks/<flow-slug>/<task-id>`.
   - Never dump raw JSON unless the user explicitly asks.

7. **Cite the URLs.** Every task referenced should be linkable: `https://taskflow.informup.org/tasks/<flow-slug>/<task-id>`. Saves the user a click.

8. **Errors**
   - **401**: token is missing/expired — tell the user to refresh `~/.taskflow-import-token`.
   - **403 `INSUFFICIENT_SCOPE`**: token lacks `tasks:read` (or similar). Tell the user to re-mint with the right scope.
   - **404**: surface what wasn't found (project slug, task ID, etc.) — don't retry blindly.

## Notes

- **Read-only, full stop.** If you find yourself reaching for POST/PATCH/DELETE, you're in the wrong skill — bail out and point the user at the right one.
- **Don't follow up with actions.** Even if the answer makes a next step obvious ("looks like FEAT-12 is stuck"), just present the data. The user picks the next skill.
- **Prefer one well-shaped query over many.** If you can answer with a single `GET /api/v1/tasks?...`, do that instead of fetching everything and filtering client-side.
- **Stale data is fine to surface, but flag it.** Timestamps are in the response — if the user asks "what's stuck?", computing age from `updatedAt` is fair game.
