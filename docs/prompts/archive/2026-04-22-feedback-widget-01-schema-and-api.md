# Phase 1 — Schema and API

**Completed:** 2026-04-22. Shipped via PR #25 (merged to `staging`): `Feedback` model, migration `20260422174556_add_feedback`, and six endpoints under `/api/v1/feedback` with 15 integration tests.

**Prerequisite:** none. This is the first phase of the feedback widget epic (see [`README.md`](./README.md)).

**Goal:** Add a `Feedback` model, run the migration, and implement all backend endpoints — both the user-facing submission route and the admin management routes. After this phase, the full API surface exists and is tested; the frontend will consume it in Phases 2 and 3.

## What to do

### Schema (`backend/prisma/schema.prisma`)

Add a `Feedback` model:

```prisma
model Feedback {
  id         String    @id @default(uuid()) @db.Uuid
  orgId      String    @map("org_id") @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  type       String    // BUG, ENHANCEMENT
  message    String    @db.Text
  page       String?
  adminNotes String?   @map("admin_notes") @db.Text
  archivedAt DateTime? @map("archived_at") @db.Timestamptz()
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  org  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([orgId, createdAt])
  @@map("feedback")
}
```

Wire the reverse relations on `Organization` and `User` (add `feedback Feedback[]` to both models).

### Migration

Run `npx prisma migrate dev --name add-feedback` after updating the schema. No data backfill needed — this is a new table.

### Routes (`backend/src/routes/feedback.ts`)

Register the route file in the Fastify app the same way existing routes are registered (check `backend/src/app.ts` or equivalent entry point for the pattern).

#### User-facing

- `POST /api/feedback` — any authenticated user.
  - Body: `{ type: "BUG" | "ENHANCEMENT", message: string, page?: string }`.
  - Validation: `type` must be one of the two enum values; `message` must be non-empty after trimming.
  - Stamps `orgId` from `request.org.id` and `userId` from `request.user.id`.
  - Returns `201` with the created feedback object.

#### Admin (org `owner` or `admin` only)

- `GET /api/feedback` — paginated list of feedback for the caller's org.
  - Query params: `page` (default 1), `limit` (default 20), `archived` (boolean, default false).
  - Order by `createdAt` descending.
  - Include the submitting user's `displayName` and `email` on each item.
  - Returns `{ data: Feedback[], total: number, page: number, limit: number }`.

- `PATCH /api/feedback/:id` — update admin notes.
  - Body: `{ adminNotes: string }`.
  - Verify the feedback belongs to the caller's org (return 404 if not).
  - Returns the updated feedback object.

- `PATCH /api/feedback/:id/archive` — toggle archive status.
  - Body: `{ archived: boolean }`.
  - Sets `archivedAt` to `now()` when archiving, `null` when unarchiving.
  - Verify org ownership (404 if not).
  - Returns the updated feedback object.

- `GET /api/feedback/export` — CSV export of all feedback (active + archived) for the caller's org.
  - Columns: `id, date, user, email, type, message, page, adminNotes, archivedAt`.
  - Return with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="feedback-export.csv"`.

### Schemas (`backend/src/routes/_schemas.ts`)

Add request/response schemas for each endpoint, following the style of existing schemas in that file.

### Permission check

Admin endpoints require org `owner` or `admin` role. Use the same role-check pattern as other admin-gated routes in this repo. If no such pattern exists yet, check `request.org.role` and return 403 for `member`.

### Tests

Follow the repo convention for integration tests (check `backend/src/__tests__/` for existing examples).

**Submission tests:**
- Authenticated user can submit feedback; response is 201 with correct shape.
- Missing or invalid `type` returns 400.
- Empty `message` returns 400.
- `orgId` on the created row matches the caller's org (not a value from the request body).
- Feedback from org A is not visible to admin in org B.

**Admin tests:**
- `GET /api/feedback` returns only feedback for the caller's org, paginated.
- `GET /api/feedback?archived=true` returns only archived items.
- `PATCH /api/feedback/:id` updates admin notes; returns 404 for feedback in another org.
- `PATCH /api/feedback/:id/archive` toggles `archivedAt`; returns 404 for feedback in another org.
- `GET /api/feedback/export` returns valid CSV with correct headers.
- All admin endpoints return 403 for a user with org role `member`.

Write each test red first, watch it fail, then implement.

## Out of scope for this phase

- Frontend components (Phase 2 and 3).
- Email notifications.
- Rate limiting.

## Done when

- `npx prisma migrate dev` applies cleanly.
- All six endpoints (`POST`, `GET` list, `PATCH` notes, `PATCH` archive, `GET` export) are implemented and pass integration tests.
- Org isolation is proven: feedback in org A is invisible to org B.
- `cd backend && npm test` is green.
