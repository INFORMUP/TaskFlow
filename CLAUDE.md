# TaskFlow

Agent-integrated task management system with flows, statuses, transitions, and team-based permissions.

## Tech Stack
- **Backend**: Node.js + TypeScript + Fastify + Prisma + PostgreSQL + Vitest
- **Frontend**: Vue 3 + TypeScript + Vite + Vue Router + Vitest

## Project Structure
```
backend/       # Fastify API server
frontend/      # Vue 3 SPA
docs/          # Design documentation
external/      # Reference projects (git submodules)
```

## Backend Startup
1. Ensure PostgreSQL is running (uses reportal-postgres container on port 5432)
2. `cd backend && npm install`
3. `npx prisma migrate dev` (first time)
4. `npx prisma db seed` (seed teams, flows, statuses, transitions)
5. `npm run dev` (starts on port 3001)

### Optional: route in-app feedback to a TaskFlow project
Set `TASKFLOW_PRODUCT_PROJECT_ORG_ID` to the org UUID that owns the TaskFlow
product project, and `TASKFLOW_PRODUCT_PROJECT_KEY` to its key (default `TF`).
With those set, every `POST /api/v1/feedback` also creates a Task on the
matching flow (BUG → bug, FEATURE → feature, IMPROVEMENT → improvement).
With either unset, feedback persists without an associated task.

## Frontend Startup
1. `cd frontend && npm install`
2. `npm run dev` (starts on port 5173)

## Running Tests
- Backend: `cd backend && npm test` (Vitest; unit + integration against the real dev DB)
- Frontend: `cd frontend && npm test` (Vitest with happy-dom; component tests via `@vue/test-utils`). Use `npm run test:watch` for watch mode.
- Frontend E2E: `cd frontend && npx playwright test` — requires the dev DB to be seeded (`cd backend && npx prisma db seed`). `e2e/login-redirect.spec.ts` and `e2e/welcome-join.spec.ts` are **known-broken** on `main`/`staging` — see issue #20. Don't let these two block unrelated work.

## Key Architecture Decisions
- **Fastify plugins** with `fastify-plugin` for encapsulation breaking (auth, error handler)
- **Permission matrix** encoded as static data in `permission.service.ts`
- **Transition validation** is pure logic in `transition.service.ts`
- **Auth**: JWT access + refresh tokens, test helper `mintTestToken()` for integration tests
- **Tests**: Sequential execution (`fileParallelism: false`) due to shared PostgreSQL database

## Database
- PostgreSQL on `localhost:5432`, database `taskflow`, user `reportal`
- Prisma schema: `backend/prisma/schema.prisma`
- Seed data: `backend/prisma/seeders/` (deterministic UUIDs via uuid5)

## Branching Workflow
- Two long-lived branches: `main` (production) and `staging`.
- All changes must be made on feature branches and PR'd into `staging` first — never PR directly into `main`.
- Promotion to `main` happens from `staging` after validation.

## Issue Tracking
- **New issues go in TaskFlow, not GitHub.** This project tracks work at https://taskflow.informup.org under the Taskflow project. Do not run `gh issue create` for new work — use the `/create-task` slash command (or POST directly to `/api/v1/tasks`). Existing GitHub issues are being migrated; new ones should not be opened.

## TaskFlow Workflow Skills

The `feature` flow runs `discuss → design → prototype → implement → validate → review → closed`. Each stage has a slash command that wraps the API and enforces the right guardrails. Skills live in `.claude/commands/` and are scoped to this repo.

| Skill | Stage | What it does |
|---|---|---|
| `/create-task <title>` | — | Creates a task in the Taskflow project. Defaults flow=`feature`, project=Taskflow. |
| `/design <task>` | `design` | Reads task + comments + relevant code, posts a structured spec (goal, user stories, acceptance criteria, technical approach, out-of-scope, open questions) as a comment. Offers transition to `prototype`. |
| `/transition <task> <status> [note]` | any | Escape hatch — moves a task to any status. Use for backward bounces (`design → discuss`), closing transitions (asks for resolution), and one-offs the workflow skills don't cover. |
| `/implement <task>` | `implement` (feature/improvement) or `resolve` (bug) | Creates a worktree at `.claude/worktrees/<task-id>/` on `feat/<task-id>-<slug>` (or `fix/...` for bug flow) off `origin/staging`. TDD-implements, opens PR targeting `staging`, links the PR via `POST /api/v1/tasks/{id}/pull-requests`. Offers transition to `validate`. |
| `/validate <task>` | `validate` | Reviews the linked PR against the design spec's acceptance criteria. Posts an APPROVE / REQUEST_CHANGES / COMMENT review on GitHub with a criterion-by-criterion checklist. If approved, offers transition to `review`. |
| `/address-review <task-or-PR>` | `validate` | Inverse of `/validate`. Pulls every reviewer comment (review summaries + inline + conversation), triages each as Fix/Reply/Defer, makes the fixes, replies to every comment, re-requests review. Does not transition — re-validation is `/validate` again. |
| `/walk <task>` | any | Generic stage-by-stage driver. Picks the task up at its current status (any flow), does that stage's work, and **prompts before every transition**. Careful counterpart to `/fast-track`: same per-stage automation, but a human "yes" gates each forward move. |
| `/taskflow-query <question>` | — | Read-only query over TaskFlow. List/filter tasks, look up projects, count work in a status, etc. Never mutates — refuses action verbs and points at the right action skill. |
| `/discuss <task> [question]` | — | Loads a single task (description, comments, linked PRs, related code) and opens a conversation about it. Read-only: no comments, no transitions. Hands off to action skills if the discussion produces a decision. |

### Workflow guardrails encoded by these skills
- **No skill auto-advances tasks it doesn't own.** `/design` won't push to prototype without asking; `/implement` refuses to start unless the task is already in `implement`. The human review points stay intact.
- **No merging from skills.** PRs are opened, reviewed, and addressed — never merged. Merge is a human decision.
- **No `--no-verify` and no force-push.** Pre-commit hooks must pass; force-push detaches inline review comments.
- **Permission matrix matters.** Skills surface 403s without retrying. Examples encoded in `backend/src/services/permission.service.ts`:
  - `feature.design` requires `product` team
  - `feature.prototype` / `feature.implement` / `feature.validate` requires `engineer` or `agent`
  - `feature.review` requires `engineer` or `product`
- **Transition notes are optional.** The server accepts transitions without a `note`. Skills should include one only when context genuinely matters (backward bounces, closing transitions); routine forward moves can omit it.
- **`closed` is terminal.** There is intentionally no `verify`/`monitor` stage between `review` and `closed`. Prod regressions are tracked as fresh `BUG` tasks, not as a per-task verification gate. Revisit only when a real prod miss creates the need.

## API Tokens (local scripts)
- Personal API tokens for taskflow.informup.org used by local scripts (e.g. issue importers) live at `~/.taskflow-import-token` (chmod 600). Read via `process.env` after sourcing, or `fs.readFileSync` directly. Do not commit tokens to the repo or place them in `backend/.env`.

## Commit Workflow
- Run `npm test` in the affected package(s) (backend, frontend, or both) before committing.
- A pre-commit hook runs `tsc --noEmit` (backend) and `vue-tsc --noEmit` (frontend) automatically. If it fails, fix type errors before committing.
- Git hooks live in `.githooks/`. After cloning, run `git config core.hooksPath .githooks` to activate them.

## Validating Tests That Require a Database
- Do not spin up a local database to run tests that need one (backend integration tests, Playwright E2E). Instead, push the branch to GitHub, open a PR into `staging`, and review the CI results there.
- Use `gh pr checks <PR>` and `gh run view <run-id> --log-failed` to inspect CI output rather than running the DB-backed suites locally.

## PR Titles (Conventional Commits)
- PRs into `staging` and direct hotfix PRs into `main` must have titles following Conventional Commits — e.g. `feat(api): add version endpoint`, `fix: handle null assignee`, `feat!: drop deprecated field` for breaking changes. The `commitlint` workflow enforces this.
- Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`, `style`. Use `!` after type/scope for breaking changes.
- The app version is bumped automatically by release-please based on these prefixes (`feat` → minor, `fix` → patch, `!` → major). Choose the type accordingly — it determines the next version. **Note**: while the app is < 1.0.0, semver convention treats breaking changes as a minor bump rather than a major bump, so `!` will produce a `0.x.0` bump until the first `1.0.0` release.
- The `staging` → `main` promotion PR is exempt and should be a **merge commit** (not squash) so the underlying conventional commits stay visible to release-please.

## Mistakes
- **[tooling]**: Fastify plugins are encapsulated by default — use `fastify-plugin` (fp) wrapper for plugins that need to affect the global scope (error handler, auth decorator).
- **[testing]**: Integration tests sharing PostgreSQL must run sequentially — set `fileParallelism: false` in vitest.config.ts to avoid FK constraint violations.
- **[testing]**: Playwright E2E tests need `npx prisma db seed` first — otherwise the `projects` table is empty and anything touching project pickers silently renders 0 options.
