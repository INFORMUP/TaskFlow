# Per-status default assignees

**Goal:** Let each project configure a default assignee per workflow status, so tasks entering that status get auto-assigned when no explicit assignee is set. Today defaults live only at the project level (`Project.defaultAssigneeUserId`, `backend/prisma/schema.prisma:189`) — there is no way to say "tickets entering Review go to Alice, tickets entering QA go to Bob."

Flows are shared across projects via `ProjectFlow` (`backend/prisma/schema.prisma:206-217`), so `FlowStatus` cannot carry the default directly — that would force every project using the flow to share one default. The defaults must be scoped per `(project, status)`.

## What to do

### Schema

- Add a new model `ProjectStatusDefaultAssignee`:
  ```prisma
  model ProjectStatusDefaultAssignee {
    projectId    String @map("project_id") @db.Uuid
    flowStatusId String @map("flow_status_id") @db.Uuid
    userId       String @map("user_id") @db.Uuid

    project    Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
    flowStatus FlowStatus @relation(fields: [flowStatusId], references: [id], onDelete: Cascade)
    user       User       @relation(fields: [userId], references: [id])

    @@id([projectId, flowStatusId])
    @@index([flowStatusId])
    @@index([userId])
    @@map("project_status_default_assignees")
  }
  ```
  Add back-relations on `Project`, `FlowStatus`, and `User`.

- Add `createdAt DateTime @default(now())` to `TaskProject` (`schema.prisma:231`). This makes "first-attached project" deterministic for the multi-project tiebreaker below.

- Generate the Prisma migration and run `npx prisma migrate dev`.

### Resolution logic (`backend/src/services/task.service.ts`)

Add a helper `resolveDefaultAssignee({ projectId | taskId, flowStatusId })`:

1. Pick the project:
   - On **task create**, use the project from the create payload.
   - On **transition**, use the task's first-attached project: `TaskProject` joined to the task, ordered by `createdAt ASC`, `LIMIT 1`. If the task has no project, return `null`.
2. Look up `ProjectStatusDefaultAssignee` for `(projectId, flowStatusId)`. Return `userId` if present.
3. Else return `Project.defaultAssigneeUserId` (may be `null`).
4. Else `null`.

**Entry-only rules:**
- On create: apply only when the payload has no `assigneeId`.
- On transition: apply only when both (a) the task's current `assigneeId` is `null` **and** (b) the transition payload does not set `newAssigneeId`. Never overwrite an existing assignee.

### API (`backend/src/routes/projects.ts` — or a new `project-status-defaults.ts`)

- `GET /projects/:id/status-defaults` → `[{ flowStatusId, userId }]`.
- `PUT /projects/:id/status-defaults/:flowStatusId` with `{ userId }` — upsert.
- `DELETE /projects/:id/status-defaults/:flowStatusId` — clear.

Auth: reuse the existing project-edit permission (check `backend/src/services/permission.service.ts` for the right key — likely project owner + team admin).

Validation:
- `flowStatusId` must belong to a flow linked to the project (`Project.defaultFlowId` or any row in `ProjectFlow`).
- `userId` must be a member of at least one team on the project (`ProjectTeam` → `UserTeam`).
- Reject with 400 on violation.

Populate OpenAPI schemas for all three routes (see existing routes in `projects.ts` for the pattern).

### Frontend (`frontend/src/features/projects/views/ProjectDetailView.vue`)

- New "Status defaults" section listing each status of the project's default flow (sorted by `sortOrder`) with an assignee `<select>` populated from project team members. Empty = no default. Persist changes via the new API.
- Add an API client method in `frontend/src/api/projects.api.ts`.

### Tests (TDD — red first)

**Backend unit (`task.service.test.ts` or new file):**
- Resolution order: per-status default > project default > `null`.
- Entry-only on create: explicit `assigneeId` in payload wins over default.
- Entry-only on transition: existing `assigneeId` is never overwritten; explicit `newAssigneeId` wins over default.
- Multi-project task: first-attached project (by `TaskProject.createdAt`) is the one consulted.
- Task with no project: default resolution returns `null`, task stays unassigned.

**Backend integration (`project-status-defaults.test.ts`):**
- `PUT` creates, `PUT` again updates, `DELETE` removes.
- Validation: status not in project's flow → 400; user not on project team → 400.
- Auth: non-editor → 403.

**Frontend (`ProjectDetailView.test.ts` or a focused component test):**
- Renders one row per status.
- Changing the dropdown calls the API.

## Out of scope

- Role-based defaults ("the project's QA lead") — still user-based only.
- Re-assigning tasks already in a status when a default is changed — defaults apply going forward only.
- Per-transition defaults (e.g., "Dev → Review" differs from "QA → Review") — per-status is enough for now.
- Notifying the newly-assigned user — existing assignment notifications (if any) apply unchanged.

## Done when

- A project can set a default assignee for each status of its default flow via the UI.
- Creating a task in that project with no assignee picks up the per-status default for the starting status.
- Transitioning an unassigned task into a status with a configured default sets the assignee on that transition.
- Transitioning a task that already has an assignee does **not** overwrite it.
- An explicit `newAssigneeId` on the transition payload always wins.
- `cd backend && npm test` and `cd frontend && npm test` are green.
