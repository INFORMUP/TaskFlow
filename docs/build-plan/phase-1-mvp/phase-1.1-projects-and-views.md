# Phase 1.1 — Projects, Filtering, and View Polish

**Status:** ✅ Shipped 2026-04-16.

**Goal:** Address first-round feedback from product review of the MVP. Introduce Projects as a first-class organizing entity, make tasks easier to triage with filters and a list view, and tighten the create-task UX around the required fields that actually matter.

## Backend

- **Database tables**:
  - `projects` (id, key, name, owner_user_id, default_assignee_user_id, created_at, archived_at)
    - Seeded: Reportal, Website, Dashboard, TaskFlow, Fundraising
  - `task_projects` (task_id, project_id) — many-to-many join, indexed both directions
- **Tasks table changes**:
  - Add `due_date` (nullable, date)
  - Required-field set on create becomes: `title`, `assignee_user_id`, at least one project. `description`, `priority`, `flow`, and `due_date` become optional (with sensible defaults where needed — flow falls back to a configurable default).
- **Transitions**:
  - Extend transition payload to optionally set `assignee_user_id` as part of the transition. Recorded in `task_transitions` so the audit log shows reassignments tied to status moves.
- **API endpoints**:
  - Projects: `GET /api/v1/projects`, `POST /api/v1/projects` (admin), `PATCH /api/v1/projects/{id}` (owner or admin), `POST/DELETE /api/v1/projects/{id}/archive`
  - Tasks:
    - Create accepts `project_ids: string[]`. If `assignee_user_id` is omitted, server fills it from the first project's `default_assignee_user_id` (error if neither is available).
    - Add `project_id`, `project_owner_user_id`, `due_before`, `due_after`, `assignee_user_id=me` filters to task list.
  - Task ↔ project membership: `POST/DELETE /api/v1/tasks/{task_id}/projects/{project_id}`.
- **Validation**:
  - Task must have ≥1 project at all times (cannot remove the last project without replacing it).
  - Project owner and default assignee must be active users.
- **Tests**: Project model + permissions, default-assignee fill on create, transition-with-assignment, new filter combinations, "last project" guard.

## Frontend

- **Project management UI**: List/create/edit projects, set owner and default assignee. Owner-only edit; admin can edit any.
- **Task creation form**:
  - Required fields reduced to title, assignee, project (multi-select).
  - Selecting the first project auto-fills assignee with that project's default (user can override).
  - Optional: due date picker, description, priority, flow.
- **Task detail view**:
  - Show project chips (multiple), due date, owner of each project.
  - Transition modal includes optional "reassign to" selector.
  - Render description with clickable links (auto-linkify URLs; markdown rendering acceptable as the implementation path).
- **Filter bar** (shared by board and list views):
  - Project, project owner, flow, status, assignee (with "Assigned to me" shortcut), due-date range.
  - Filters persisted in URL query params so views are shareable and bookmarkable.
- **List view**: Sortable table (title, project(s), assignee, status, priority, due date, updated). Toggle between board and list view from the same filter context.
- **Tests**: Project CRUD flow, create-task default-assignee behavior, filter persistence, list/board toggle preserves filters.

## Migration notes

- Backfill: existing tasks need at least one project. Either (a) seed a generic "Unsorted" project and assign all existing tasks to it, or (b) assign existing tasks to a project inferred from their team. Preference: (a) for safety, with a follow-up sweep.
- Existing tasks without an assignee: leave as-is for now; new validation only applies to creates and updates that touch the assignee field.

## What this validates

- Does the project abstraction match how the team actually organizes work, or do we need sub-projects / tags?
- Is "default assignee per project" enough, or do people want routing rules (e.g. by flow type within a project)?
- Does the list view replace the board for power users, or do both stay in regular use?
- Are URL-persisted filters discoverable enough, or do we need saved views?
