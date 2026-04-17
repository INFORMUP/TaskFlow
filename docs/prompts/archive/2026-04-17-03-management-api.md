# Phase 3 — Organization management API

**Completed:** 2026-04-17. Added `/api/v1/organizations` routes (list/create/detail/add-member/patch-role/remove) and `POST /api/v1/auth/switch-org`; 17 new integration tests covering happy path + owner/admin/member permission matrix; 278/278 backend tests green.

**Prerequisite:** Phase 2 ([`02-auth-and-scoping.md`](./02-auth-and-scoping.md)) is merged to `main`. Every request is already org-scoped; this phase adds the surface to list/create orgs, manage members, and switch the active org on a token.

**Goal:** A user can list their memberships, create a new org, manage members, and swap the active org on their access token — all over HTTP.

## What to do

### Routes

Add under `/organizations`:

- `GET /organizations` — list the caller's memberships (org id, slug, name, caller's role).
- `POST /organizations` — create an org; caller becomes `owner` and gets an `OrgMember` row automatically.
- `GET /organizations/:id` — org detail (members + roles). Requires membership.
- `POST /organizations/:id/members` — invite/add user by email; body `{ email, role }`. Requires `owner` or `admin`. If the email doesn't match an existing `User`, decide per existing invite-flow convention (probably create an `invited` user row).
- `PATCH /organizations/:id/members/:userId` — change role. `owner`-only for promoting to/from `owner`; `admin` may manage `member`.
- `DELETE /organizations/:id/members/:userId` — remove. `owner`-only for removing another `owner`.

Existing routes are unchanged in shape but remain implicitly org-scoped via the auth-decorated `request.org` (already wired in Phase 2).

### Switch-org

- `POST /auth/switch-org` — body `{ orgId }`. Verifies the caller has an `OrgMember` row for that org; issues a fresh access token with the new `orgId` + `orgRole` claims. Refresh token is unchanged.

### OpenAPI

Populate schemas for every new route. Follow the style of existing routes in `backend/src/routes/` and the shared `backend/src/routes/_schemas.ts`.

### Tests

- Route-level tests for each `/organizations/*` endpoint: happy path + each permission denial (non-member, wrong role).
- `POST /auth/switch-org`: issues a token whose subsequent reads target the new org; rejects non-members with 403.
- Creating an org makes the caller `owner` automatically and is visible in `GET /organizations` immediately.

## Out of scope for this phase

- Frontend switcher / settings UI (Phase 4).
- Invite email delivery — the route can create the membership / invited-user row synchronously; actual email sending is a later concern.
- Org deletion endpoint.

## Done when

- All six `/organizations/*` routes and `POST /auth/switch-org` are implemented, documented in OpenAPI, and covered by tests.
- Creating an org, adding a member, switching to it, and reading that org's data works end-to-end via HTTP.
- `cd backend && npm test` is green.
