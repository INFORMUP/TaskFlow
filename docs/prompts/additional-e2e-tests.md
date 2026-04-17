# Additional E2E tests

**Goal:** Expand Playwright coverage beyond the single `welcome-join.spec.ts` spec so the most load-bearing user journeys are exercised end-to-end against a real backend + DB. E2E is the only layer that catches router guards, auth token wiring, cross-feature navigation, and real API contract drift together — add specs where regressions would most hurt.

## Ground rules

- Playwright config lives at `frontend/playwright.config.ts`; specs go in `frontend/e2e/*.spec.ts`. Runner dev-serves the SPA on port 5176 with `workers: 1, fullyParallel: false` — keep it that way; shared DB.
- Seed auth via `page.addInitScript` writing `accessToken` / `refreshToken` to `localStorage` **before** `page.goto`, mirroring `welcome-join.spec.ts`. Do not drive the real login form unless the spec is specifically testing login.
- Use the `createNoTeamUser` helper in `frontend/e2e/helpers/test-user.ts` for isolation. Extend it (don't fork) if you need variants — e.g. add `createUserWithTeams(slugs: string[])`, `createUserWithTasks(...)`. Every spec creates its own user; never reuse fixtures across specs.
- Assert DB side-effects with the `pg` client pattern already in `welcome-join.spec.ts` when the UI confirmation alone is insufficient (writes, deletes, permission-gated actions).
- Prefer `getByRole` / `getByTestId` over CSS selectors. Add `data-testid` to components if a robust selector doesn't exist — small, reviewable diffs.
- Each spec must be independent and idempotent. No ordering assumptions. No leftover DB state that would break a re-run (use per-test unique emails; the existing helper already does this).

## Specs to add, in priority order

Land one spec per PR unless trivially grouped. Do not start the next until the previous is green in CI.

### 1. Login → redirect preserves intended destination
Covers the router-guard + redirect logic recently touched in `d403a5e` and `login-preserve-redirect.md`. Navigate unauthenticated to a deep link (e.g. `/flows/<id>`), expect redirect to `/login`, complete login (mint tokens directly and submit, or drive the Google OAuth stub if one exists), expect to land on the original deep link — not the default home.

### 2. Flow list → open flow → transition a task's status
The core happy path. Seed a user with membership in a team that owns a flow with at least one task in an initial status. From `/flows`, click into the flow, open a task, trigger an allowed transition, assert the new status is visible and that the `tasks` row's `status_id` in the DB matches. Then attempt a transition the user lacks permission for and assert the control is absent or disabled.

### 3. Session expiry → redirect to login (not raw 401)
Regression guard for commit `d403a5e`. Seed an **expired** access token + valid refresh token, navigate to an authed route, and assert the app either silently refreshes (preferred) or redirects to `/login` without surfacing a raw 401 error. Then seed both tokens expired and assert redirect-to-login with no uncaught errors in `page.on("pageerror")`.

### 4. Token management: create, copy, revoke
Settings surface. Create a personal access token, assert it appears exactly once in plaintext (and only once — reloads should show a masked form), copy-to-clipboard works (`page.evaluate(() => navigator.clipboard.readText())` with clipboard perms granted in the Playwright context), revoke it, assert it disappears from the UI and the `tokens` row is gone / marked revoked in the DB.

### 5. CORS / non-GET request smoke test
Regression guard for commit `a5d885b`. Any spec that exercises a PUT / PATCH / DELETE through the real UI already covers this implicitly — if spec #2 does a status transition via PATCH, that's sufficient; otherwise add a dedicated minimal spec that triggers one non-GET request and asserts success.

### 6. Empty states & onboarding tour (if `onboarding-empty-states-and-tour.md` has shipped)
Seed a no-team user, dismiss the welcome modal, assert the empty-state CTAs render and are keyboard-reachable. Skip this spec until that feature lands on `main`.

## Helpers to add

Put new helpers in `frontend/e2e/helpers/` next to `test-user.ts`:

- `createUserWithTeams(slugs: string[], primary?: string)` — inserts `user_teams` rows directly.
- `seedTaskInFlow(userId, { flowSlug, statusSlug })` — returns the task id so specs can assert transitions against it.
- `expiredToken(userId)` — mints an access token with `expiresIn: "-1s"` for spec #3.

Keep helpers DB-direct (no HTTP) so they're fast and don't depend on the API surface under test.

## Tooling & CI

- Add an npm script `test:e2e` in `frontend/package.json` if one doesn't exist: `playwright test`.
- Ensure the backend dev server is running (or document the prerequisite at the top of each spec file — the Playwright `webServer` block only boots the frontend). If backend boot should be automated, extend `playwright.config.ts` with a second `webServer` entry pointing at `cd ../backend && npm run dev`.
- Do **not** wire E2E into the pre-commit hook (slow). If the project has CI, add a GitHub Actions job that runs `npm run test:e2e` after `npm test` — but only if CI already exists; do not introduce CI as part of this prompt.

## Out of scope

- Visual regression / screenshot diffing.
- Cross-browser matrix (stay on `chromium` only for now).
- Load or perf testing.
- Replacing any existing component/integration tests — E2E complements, does not replace.

## Done when

- Specs 1–5 above exist under `frontend/e2e/` and pass locally against a seeded dev DB with `npx playwright test`.
- Each spec creates its own user and cleans up after itself (or is safely idempotent on re-run).
- New helpers are co-located in `frontend/e2e/helpers/` and reused across specs — no copy-paste user-creation in individual specs.
- `cd frontend && npm test` stays green (no regressions in unit/component tests).
- A short section is added to `frontend/README.md` explaining how to run E2E tests locally (prereqs: backend running, DB seeded, `npx playwright install` once).
