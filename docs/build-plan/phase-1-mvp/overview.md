# Phase 1 — MVP: Core Task Management

**Status:** ✅ Complete

**Goal:** A working task management system where humans can create, view, transition, and comment on tasks through a web UI and API. Enough to evaluate the core workflow model.

## Backend

- **Project scaffolding**: Fastify + TypeBox + Prisma + PostgreSQL + Vitest
- **Database tables**:
  - `teams` (seeded: Engineer, Product, User, Agent)
  - `users` (actor_type, status, display_name, email, timezone)
  - `user_teams` (multi-team membership)
  - `flows` (seeded: Bug, Feature, Improvement)
  - `flow_statuses` (seeded per flow, with sort_order)
  - `flow_transitions` (seeded: allowed transitions per flow, including backward transitions and any-status-to-Closed)
  - `tasks` (display_id, title, description, priority, resolution, assignee, soft delete)
  - `task_transitions` (immutable audit log with required note, actor_type)
  - `comments` (soft delete)
- **Auth**: Google OAuth for web UI login. JWT access + refresh tokens.
  - `oauth_connections`
- **API endpoints**:
  - `POST /api/v1/auth/callback` (OAuth callback)
  - `POST /api/v1/auth/refresh`
  - Tasks: full CRUD, filtering by flow/status/assignee/priority, cursor pagination
  - Assignments: assign/unassign (`POST/DELETE /api/v1/tasks/{task_id}/assign`)
  - Transitions: create (with required note, resolution on close), list history
  - Comments: create, list, edit (own), soft delete
  - Users/Teams: list
- **Validation**: Transition validity enforced (allowed transitions, required note, required resolution on close). Permission checks per team per flow. "Admin" permission level (used by label creation, webhook management, user listing) is granted to the Engineer team until a dedicated Admin team is introduced.
- **Tests**: Models, transition logic, permission enforcement, API endpoint integration tests.

## Frontend

- **Project scaffolding**: Vue 3 + TypeScript + Vite + Vue Router + Vitest + Playwright
- **Auth flow**: Google OAuth login, JWT token management
- **Task board view**: Kanban-style columns by status, per flow. Filter by flow type.
- **Task detail view**: Title, description, priority, assignee, current status, resolution (if closed). Transition button with required note input. Resolution selector when closing. Comment thread.
- **Task creation form**: Flow type, title, description, priority.
- **Flow audit history**: Timeline view of all transitions with actor, note, and timestamp on the task detail page.
- **Basic navigation**: Flow selector, task list/board toggle, user menu.

## What this validates

- Is the flow/status/transition model correct and usable?
- Do the status change notes provide useful audit context in practice?
- Are the permission boundaries appropriate?
- Is the resolution model (vs. separate invalid/rejected statuses) workable?
