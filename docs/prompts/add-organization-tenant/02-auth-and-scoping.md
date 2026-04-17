# Phase 2 — Auth and request scoping

**Prerequisite:** Phase 1 ([`01-schema-and-seeders.md`](./01-schema-and-seeders.md)) is merged to `main`. The schema already carries `orgId` on every top-level entity; this phase makes the runtime actually enforce it.

**Goal:** Every authenticated request is scoped to a single org. A user with data in org A cannot read, update, or delete anything in org B — enforced by red-first integration tests, one per resource.

## What to do

### JWT + auth plugin

- **JWT claims** (`backend/src/services/auth.service.ts` — or wherever tokens are minted in this repo — and the `mintTestToken` test helper): add `orgId` and `orgRole`. On login, pick the user's first `OrgMember` as the active org; this becomes the default until the org switcher (Phase 3+4) exists.
- **Auth plugin** (`backend/src/plugins/auth.ts`): after verifying the token, load the `OrgMember` row for `(userId, orgId)` and decorate `request.org = { id, role }`. Reject with 403 if the claimed `orgId` is not a current membership.

### Scoping helper (new)

- Create `backend/src/services/org-scope.ts`. Export:
  - `orgScopedWhere(orgId)` — a reusable Prisma `where` fragment.
  - `requireSameOrg(entity, orgId)` — throws 404 (not 403, to avoid leaking existence) if the loaded entity's `orgId` does not match.
- Every top-level query in a service must route through one of these. This is the **single choke point** that prevents cross-tenant leaks. Review each service for direct `prisma.*.findX` / `update` / `delete` calls and convert them.

### Services

Scope every read/write to `request.org.id`:

- `team.service.ts`, `project.service.ts`, `flow.service.ts`, `api-token.service.ts`, `app-setting.service.ts` — add `orgId` to every `where` and stamp it on every create.
- `task.service.ts`, `comment.service.ts`, `transition.service.ts` — scope via the parent `Flow`/`Project` (they inherit transitively). Use `requireSameOrg` on the parent before operating on the child.
- `permission.service.ts` — extend the matrix with org-level roles (`owner`, `admin`, `member`). Org `owner`/`admin` implies every team-level permission within the org; `member` inherits only from explicit team membership.

> Note: in this repo, some services may be implemented inline in route handlers rather than as dedicated `*.service.ts` files. Apply the same rule: every Prisma call against a top-level entity goes through `orgScopedWhere` / `requireSameOrg`.

### Tests (red first)

**Backend unit:**
- `permission.service.test.ts`: org `owner`/`admin` grants project/team permissions transitively; `member` does not.
- `org-scope.test.ts`: `orgScopedWhere` composes correctly with existing filters.

**Backend integration** (this repo keeps integration tests under `backend/src/__tests__/`; match that convention unless there's already a `backend/test/integration/` dir):
- Seed two orgs A and B with disjoint users. For each resource — `team`, `project`, `flow`, `task`, `comment`, `api token`, `app setting` — assert: user-in-A cannot read, update, or delete an entity in B. These are the leak tests — one per resource, no exceptions.
- Uniqueness: the same team slug can exist in A and B; collides within a single org. Same for project `key`.
- `OrgMember` role changes take effect on next token (document in a test comment that tokens are not revoked on role change — acceptable for now).

Write each test red first, watch it fail for the right reason (403/404 or visible leak), then implement.

## Out of scope for this phase

- `/organizations` routes and `POST /auth/switch-org` (Phase 3).
- Frontend changes (Phase 4).
- Token revocation on role change.

## Done when

- Every top-level Prisma call in every service goes through the `org-scope` helper or the auth-decorated `request.org`.
- Two orgs seeded side-by-side cannot see each other's teams, projects, flows, tasks, comments, api tokens, or app settings — enforced by integration tests, one per resource.
- Uniqueness tests prove the same slug/key can coexist across orgs and still collide within one.
- `cd backend && npm test` is green.
