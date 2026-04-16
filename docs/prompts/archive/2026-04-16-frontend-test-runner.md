# Add a frontend test runner

**Completed:** 2026-04-16. Shipped in `72b7c62` — dedicated `frontend/vitest.config.ts` (happy-dom + Vue SFC + `@` alias), `test` / `test:watch` scripts, and `MarkdownView.test.ts` smoke test. CLAUDE.md now points at `cd frontend && npm test`.

**Goal:** Give `frontend/` an actual test command so frontend code can be covered the way the backend is. Today `frontend/package.json` has no `test` script and there are no frontend tests.

## What to do

- Pick Vitest (the stack already uses it server-side; shares config vocabulary and is the natural Vite pairing).
- Add Vitest + a Vue component testing library (e.g. `@vue/test-utils` + `@testing-library/vue` if component tests are desired) as dev dependencies in `frontend/package.json`.
- Add a `test` script (`vitest run`) and a `test:watch` script (`vitest`).
- Add a `vitest.config.ts` configured for jsdom, Vue SFC support, and the project's path aliases.
- Write at least one smoke test against a simple component so the runner has something to execute and so future agents see the expected layout.
- Update the project `CLAUDE.md` "Running Tests" section to point at the new command.

## Out of scope

- Backfilling component coverage. This prompt is about infrastructure, not exhaustive tests.
- E2E / browser-automation tooling (Playwright, Cypress). Unit/component tests only.

## Done when

- `cd frontend && npm test` runs and passes.
- At least one real test file exists under `frontend/src/`.
- CLAUDE.md reflects the new command.
