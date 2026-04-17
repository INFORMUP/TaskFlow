# Add Organization as a top-level tenant

**Completed:** 2026-04-17. All four phases shipped (see archived `2026-04-17-01…04-*.md`). Final phase landed in commit `0174ed2`.

**Goal:** Turn TaskFlow from a single-tenant app into a multi-tenant one by introducing an `Organization` that owns Teams, Projects, Flows, ApiTokens, and per-org AppSettings. Users remain global identities and join organizations via membership, matching how agents and integrations will likely need to participate in more than one org.

Today every top-level entity (`Team`, `Project`, `Flow`, `ApiToken`, `AppSetting`) lives in a flat namespace (`backend/prisma/schema.prisma`). There is no tenant boundary, so team/project/flow slugs are globally unique and any authenticated user can in principle be granted access to anything. This work roots the namespace at `Organization` and adds the scoping plumbing.

We picked the **scope-at-the-root** shape: every major entity carries `orgId`. Scoping at Team was considered and rejected — it makes cross-team-within-org sharing awkward and leaves `Flow`/`ApiToken`/`AppSetting` without a clean owner.

## Execution order

Work the phases in order. Each phase must land green on `main` before the next begins — do not stack branches. Each file is self-contained; open it and follow its instructions.

1. [`01-schema-and-seeders.md`](./01-schema-and-seeders.md) — Schema changes, migration with default-org backfill, seeders. No behavior change yet.
2. [`02-auth-and-scoping.md`](./02-auth-and-scoping.md) — JWT claims, `request.org` decoration, `org-scope` helper, every service filters by org, red-first leak tests (one per resource).
3. [`03-management-api.md`](./03-management-api.md) — `/organizations` routes and `POST /auth/switch-org`, OpenAPI, route tests.
4. [`04-frontend.md`](./04-frontend.md) — `orgStore`, org switcher, Org settings view, login routing, frontend tests.

When a phase ships, move its file to `docs/prompts/archive/` with the `YYYY-MM-DD-` prefix per the parent `docs/prompts/CLAUDE.md` workflow. Leave this README in place until all four phases are done, then archive it too (e.g. `archive/YYYY-MM-DD-add-organization-tenant-README.md`).

## Out of scope (applies to every phase)

- SSO / SAML / SCIM provisioning — membership is manual or invite-by-email only.
- Billing, plans, quotas per org.
- Cross-org sharing of flows, projects, or tasks.
- Per-org branding / custom domains.
- Denormalizing `orgId` onto `Task`/`Comment`/`TaskTransition` for query perf — revisit only if profiling demands it.
- Token revocation on role change or membership removal — current behavior (wait for access-token expiry) is acceptable.
- Data export / org deletion cascade UX — `onDelete: Cascade` on `OrgMember` is in schema, but a "delete my org" flow is not built.

## Done when (whole epic)

- A fresh dev DB seeds into one default org, and every existing team/project/flow/task/api token is reachable exactly as before for a seeded user.
- Two orgs seeded side-by-side cannot see each other's teams, projects, flows, tasks, comments, api tokens, or app settings — enforced by integration tests, one per resource.
- Login returns an access token carrying `orgId` + `orgRole`; `POST /auth/switch-org` swaps it.
- The frontend shows an org switcher in the top bar and persists the active org across reloads.
- `cd backend && npm test` and `cd frontend && npm test` are green.
