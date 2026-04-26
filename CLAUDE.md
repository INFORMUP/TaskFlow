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

## Commit Workflow
- Run `npm test` in the affected package(s) (backend, frontend, or both) before committing.
- A pre-commit hook runs `tsc --noEmit` (backend) and `vue-tsc --noEmit` (frontend) automatically. If it fails, fix type errors before committing.
- Git hooks live in `.githooks/`. After cloning, run `git config core.hooksPath .githooks` to activate them.

## Mistakes
- **[tooling]**: Fastify plugins are encapsulated by default — use `fastify-plugin` (fp) wrapper for plugins that need to affect the global scope (error handler, auth decorator).
- **[testing]**: Integration tests sharing PostgreSQL must run sequentially — set `fileParallelism: false` in vitest.config.ts to avoid FK constraint violations.
- **[testing]**: Playwright E2E tests need `npx prisma db seed` first — otherwise the `projects` table is empty and anything touching project pickers silently renders 0 options.
