# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## End-to-end tests

Playwright specs live under `e2e/` and drive the SPA on port 5176 against the real backend and database. Shared helpers (test-user creation, token minting) sit in `e2e/helpers/`.

Prerequisites:

1. PostgreSQL is up and `backend/.env` has `DATABASE_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` — the helpers read these to insert users and mint tokens directly.
2. The DB has been migrated and seeded (`cd ../backend && npx prisma migrate dev && npx prisma db seed`). Specs assume the default organization seeded by `organization.seeder.ts`.
3. The backend dev server is running on port 3001 (`cd ../backend && npm run dev`). Playwright's `webServer` block only boots the frontend.
4. Playwright browsers are installed — run `npx playwright install` once after cloning.

Run the suite:

```sh
npm run test:e2e
```

The config pins `workers: 1` and `fullyParallel: false` because specs share the dev DB. Every spec creates its own user via the helpers and cleans up after itself (or is idempotent on re-run).
