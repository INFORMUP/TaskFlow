# Phase 4 — Frontend org switcher and settings

**Prerequisite:** Phase 3 ([`03-management-api.md`](./03-management-api.md)) is merged to `main`. The backend exposes `/organizations` and `POST /auth/switch-org`; this phase wires it into the Vue app.

**Goal:** Users see their active org in the top bar, can switch between orgs, and can manage members from an Organization settings view.

## What to do

### Store

- Add `orgStore` at `frontend/src/stores/org.store.ts`:
  - State: active org (`{ id, slug, name, role }`) and full membership list.
  - Hydrate from the login response (and from `GET /organizations` on reload if not in the token).
  - Persist the active org id so it survives reloads (localStorage, same pattern as existing auth state in this repo).

### API client

- In `frontend/src/api/`: add a `switchOrg(orgId)` call that hits `POST /auth/switch-org`, replaces the stored access token, and updates `orgStore`.
- No explicit `X-Org-Id` header. The active org is carried inside the JWT claim; the existing request interceptor just needs to send whatever token is current.

### UI

- **Org switcher** in the top bar, populated from `orgStore.memberships`. Selecting a different org triggers `switchOrg` and refetches the current view.
- **Organization settings** view showing members + roles, with controls to add / change-role / remove per Phase 3 permissions. Gate the view on `orgRole !== 'member'`.
- **Login flow:**
  - 0 memberships → route to "Create your first organization" page (calls `POST /organizations`, then lands on the new org).
  - Exactly 1 → route straight to the app as today.
  - Many → land on the last active org from localStorage; fall back to the first membership.

### Tests

Use the existing Vitest + `@vue/test-utils` + happy-dom setup.

- Org switcher: changing orgs calls `switchOrg`, updates the stored token, and refetches the current view (mock the API).
- Login routing: 0 / 1 / many memberships each route correctly.
- Settings view: hidden/blocked for `member`; visible and interactive for `admin` / `owner`.

## Out of scope for this phase

- Per-org branding / theming.
- Real-time member-list updates (pull-to-refresh / manual reload is fine).
- Email invite UX beyond what Phase 3's endpoint supports.

## Done when

- The top bar shows an org switcher populated from memberships; changing it swaps the token and refetches.
- Organization settings view lists members with role, and `owner`/`admin` can add / change-role / remove.
- Login routes correctly for 0 / 1 / many memberships and the active org persists across reloads.
- `cd frontend && npm test` is green.
