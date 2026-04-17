# Phase 1 — Schema and seeders

**Prerequisite:** none. This is the first phase of the org-tenant epic (see [`README.md`](./README.md)).

**Goal:** Introduce `Organization` / `OrgMember` and make every top-level entity carry `orgId`, without changing any runtime behavior yet. After this phase, the DB shape supports multi-tenancy but auth and services still ignore it.

## What to do

### Schema (`backend/prisma/schema.prisma`)

- Add `Organization` and `OrgMember`:
  ```prisma
  model Organization {
    id        String   @id @default(uuid()) @db.Uuid
    slug      String   @unique
    name      String
    createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()

    members     OrgMember[]
    teams       Team[]
    projects    Project[]
    flows       Flow[]
    apiTokens   ApiToken[]
    appSettings AppSetting[]

    @@map("organizations")
  }

  model OrgMember {
    orgId  String @map("org_id") @db.Uuid
    userId String @map("user_id") @db.Uuid
    role   String // owner, admin, member
    createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()

    org  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
    user User         @relation(fields: [userId], references: [id])

    @@id([orgId, userId])
    @@index([userId])
    @@map("org_members")
  }
  ```

- Add `orgId String @db.Uuid` + relation to: `Team`, `Project`, `Flow`, `ApiToken`.
- Change `AppSetting` from the `singleton` row to a per-org row: drop the `id` default, make `orgId` the primary key, backfill one row per org.
- Swap uniqueness constraints so they scope to the org:
  - `Team`: drop global `@unique` on `name` and `slug`; add `@@unique([orgId, slug])` and `@@unique([orgId, name])`.
  - `Project`: drop global `@unique` on `key`; add `@@unique([orgId, key])`.
  - `Flow`: replace `@@index([slug])` with `@@index([orgId, slug])`.
  - `ApiToken`: keep `tokenHash` globally unique (hashes must not collide across orgs); add `@@index([orgId])`.
- Do **not** add `orgId` to `Task`, `Comment`, `TaskTransition`, `FlowStatus`, or `FlowTransition`. They inherit transitively via `Flow`/`Project`. Denormalize later only if query perf demands it.

### Migration

Single-shot migration, pre-prod (no live tenants to preserve):

1. Create `organizations` and `org_members` tables.
2. Insert a deterministic "default" organization (uuid5 from a fixed namespace so fixtures stay stable).
3. Backfill `orgId` on every existing `Team`, `Project`, `Flow`, `ApiToken` to the default org.
4. Backfill `OrgMember` from the distinct set of users reachable via `UserTeam → Team` for that org; assign role `member` (grant `owner` to the current seed admin).
5. Convert `app_settings` to per-org: migrate the singleton row to `(orgId = default)`.
6. Add NOT NULL + FK constraints and swap the unique indexes.
7. Run `npx prisma migrate dev` and verify seeds still load.

### Seeders (`backend/prisma/seeders/`)

- Add an `organization.seeder.ts` that creates the default org first (deterministic uuid5; reuse the same namespace as the migration so IDs match).
- Update every existing seeder to accept `orgId` and stamp it on rows it creates.
- Seed at least one `OrgMember` row per seeded user.

## Out of scope for this phase

- Any auth / service / route changes. Services and routes should continue to work exactly as before, simply ignoring `orgId` at runtime (the column is NOT NULL and populated, that's enough).
- Frontend changes.
- New API surface.

## Done when

- `cd backend && npx prisma migrate dev` applies cleanly from a fresh DB.
- `cd backend && npx prisma db seed` populates the default org plus memberships and all existing fixtures stamp `orgId`.
- `cd backend && npm test` is green with no test changes required (behavior unchanged).
- `cd frontend && npm test` is green (untouched).
