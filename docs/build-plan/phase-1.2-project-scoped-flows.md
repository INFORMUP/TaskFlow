# Phase 1.2 — Project-Scoped Flows

**Goal:** Make flows belong to projects so non-engineering work (Fundraising, and anything else added later) can use status sets that actually fit the domain. Engineering projects keep sharing the bug-fix / feature / refactor flows; Fundraising gets its own. Builds directly on Phase 1.1's projects and task↔project M:N.

## Backend

- **Database tables**:
  - `project_flows` (project_id, flow_id, created_at) — many-to-many join, PK `(project_id, flow_id)`, indexed both directions. Lets one flow be shared across projects without cloning.
  - `projects.default_flow_id` (nullable, FK → flows.id) — replaces the global default-flow fallback from 1.1. Must be present in the project's `project_flows` set.
- **Flows table changes**:
  - Drop the global `slug` unique constraint. Slug uniqueness becomes a per-project UI concern (display names enforced in the project flow management screen). Existing slugs stay as-is.
- **Validation** (service layer):
  - Task create/update: `flow_id` must appear in `project_flows` for **at least one** of the task's `project_ids` (union, not intersection — projects are flow *menus*, not *constraints*).
  - Removing a project from a task: block if the task's current flow is no longer reachable through any remaining project (mirrors 1.1's "last project" guard).
  - Removing a flow from a project (`project_flows` row): block if any non-archived task on that project uses the flow and has no other attached project that also offers it.
  - `projects.default_flow_id` must be in `project_flows` for that project.
- **API endpoints**:
  - `GET /api/v1/projects/{id}/flows` — list flows attached to a project.
  - `POST /api/v1/projects/{id}/flows` (admin or project owner) — body `{ flow_id }`, attach an existing flow.
  - `DELETE /api/v1/projects/{id}/flows/{flow_id}` (admin or project owner) — detach with the guard above.
  - `PATCH /api/v1/projects/{id}` — now accepts `default_flow_id`.
  - Task create: when `flow_id` is omitted, fill from the **first selected project's** `default_flow_id` (parallel rule to 1.1's default-assignee behavior; error if none of the selected projects has a default).
  - Task list `flow_id` filter is unchanged; the union semantics fall out of the existing data model.
- **Tests**: project↔flow attach/detach, default-flow validation, union-membership rule on task create, last-flow-reachability guard on project removal, detach guard, default-assignee + default-flow interaction when both fall back from project defaults.

## Seed / migration

1. Create `project_flows` and `projects.default_flow_id`.
2. Drop `flows.slug` unique constraint.
3. Backfill `project_flows`:
   - Reportal, Website, Dashboard, TaskFlow → attach `bug-fix`, `feature`, `refactor`.
   - Fundraising → seed new flows (`grant-application`, `donor-outreach`, `event`) with appropriate statuses and transitions, attach only those.
   - "Unsorted" backfill project from 1.1 → attach all three engineering flows so legacy tasks remain valid.
4. Set `default_flow_id` per project (engineering → `feature`; Fundraising → `grant-application`; Unsorted → `feature`).
5. Verification sweep: for every existing task, assert `task.flow_id` is reachable from at least one of its `project_ids`. Fail the migration loudly if not — do not silently reassign.

## Frontend

- **Project edit screen**: add a "Flows" section listing attached flows with attach/detach controls and a "default" radio.
- **Task creation form**: flow picker is filtered to the union of attached flows across the currently selected projects. Selecting/deselecting projects updates the picker live. When the picker is left blank and the first project has a default flow, show the default as a hint.
- **Task detail view**: no visual change to the flow chip itself, but the transition modal's status options already come from the task's flow — no work needed.
- **Tests**: flow picker reacts to project selection, default-flow hint appears, project edit attach/detach round-trip, detach blocked by in-use guard surfaces a usable error.

## What this validates

- Are shared flows enough, or do projects want **variants** of a shared flow (e.g. Reportal's bug-fix with an extra "QA" status)? If yes, the join-table model breaks down and the next iteration needs flow-cloning-on-attach.
- Do the seeded Fundraising statuses/transitions match how that work actually moves? Expect at least one revision after real use.
- Is "first selected project's default" the right precedence rule for auto-filling flow, or do users expect to pick the default project explicitly?
- Does per-project flow management belong to project owners, or should it be admin-only? (Phase 1.2 starts permissive — owner or admin — and tightens if needed.)
