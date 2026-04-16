# Phase 2.1 — Token Infrastructure

**Status:** ✅ Shipped 2026-04-16.

**Goal:** Bearer-authenticated API tokens with scoped permissions. Independently testable via curl before any UI exists.

## Backend

- **Database tables**:
  - `api_tokens` (id, user_id, token_hash, token_name, expires_at, created_at, revoked_at)
  - `scopes` (seeded lookup table: e.g. `tasks:read`, `tasks:write`, `transitions:write`, `comments:write`)
  - `api_token_scopes` (token_id, scope_id) — junction
- **Token format**: Opaque prefix + random secret (e.g. `tf_<random>`). Hash with a constant-time HMAC on write; never store plaintext. Return plaintext once from the create endpoint and never again.
- **API endpoints**:
  - `POST /api/v1/auth/tokens` — create scoped token. Body: `{ name, scopes: string[], expires_at? }`. Returns token once in plaintext.
  - `DELETE /api/v1/auth/tokens/{token_id}` — revoke (sets `revoked_at`).
  - `GET /api/v1/auth/tokens` — list the authenticated user's tokens (metadata only; no secrets).
- **Auth middleware update**: Accept Bearer tokens that are API tokens in addition to JWTs. Lookup by hash, verify not expired or revoked, resolve owning user, attach token scopes to the request context.
- **Permission resolution**: Effective permissions = token scopes ∩ user's team permissions. A scope cannot grant what the user's teams don't already allow.
- **Tests**: Token create/revoke/list endpoints, hash-only storage, Bearer auth round-trip, scope intersection with team permissions, expired and revoked tokens rejected.

## What this validates

- Is the scope taxonomy right, or does it need finer/coarser granularity?
- Does the scope-intersects-team-permission rule feel correct, or does it surprise users?
