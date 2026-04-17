# Preserve the originally requested route through login

**Completed:** 2026-04-17. Router guard now passes `redirect` query param to `/login`; LoginView encodes it in OAuth `state` (base64), validates it's a safe internal path, and redirects after login. Tests added for both guard and LoginView.

**Goal:** Deep links currently lose their destination when the user isn't authenticated. The router guard (`frontend/src/router/index.ts:56-63`) sends the user to `/login` with no record of where they were headed, and `LoginView.vue` unconditionally pushes them to `/tasks/bug` after a successful Google sign-in (`frontend/src/features/auth/views/LoginView.vue:43`). A user who pastes a link to `/tasks/bug/abc123` or `/projects/42` should land back on that page, not the default board.

## What to do

- In the auth guard (`frontend/src/router/index.ts`), when bouncing an unauthenticated user to `/login`, pass the originally requested path as a query param:
  ```ts
  return { name: "login", query: { redirect: to.fullPath } };
  ```
  Skip the param when `to.fullPath` is already `/login` or `/` (no point round-tripping the default).

- In `LoginView.vue`:
  - Read `redirect` from `useRoute().query` on mount.
  - Pass it through the Google OAuth round-trip using the OAuth `state` parameter (the `code` callback lands on a fresh page load, so the query param from the initial bounce is gone by then). Build `state` as a URL-encoded JSON blob or a simple base64-encoded path; validate it's an internal path (starts with `/`, no protocol, no `//`) before using it to block open-redirect abuse.
  - After `login(...)` succeeds, `router.push(safeRedirect ?? "/tasks/bug")` instead of the hardcoded destination.

- Update `LoginView.test.ts` to cover:
  - Successful callback with a `state`-encoded redirect pushes to that path.
  - Successful callback with no/invalid `state` falls back to `/tasks/bug`.
  - A `state` value pointing outside the app (e.g. `https://evil.example/x`, `//evil.example`) is rejected and falls back to the default.

- Update `router/index.test.ts` to assert that the guard attaches `redirect=<fullPath>` when bouncing an unauthenticated deep link, and omits it for `/` and `/login`.

## Out of scope

- Changing the OAuth provider config or redirect URI registered with Google (still `${origin}/login`).
- Persisting the redirect across tab closes or across refresh-token renewals — this only covers the single login flow.
- Redesigning the login view's look/feel.

## Security notes

- Only accept redirect targets that are same-origin internal paths. Reject anything that contains `://`, starts with `//`, or fails to start with a single `/`. This prevents the login page from being used as an open redirector.
- Don't log the raw `state` value at info level — treat it like any other user-controlled input.

## Done when

- Visiting `/projects/42` while logged out lands on `/login`, and completing Google sign-in returns the user to `/projects/42`.
- Visiting `/` or `/login` while logged out does **not** add a `redirect` query param.
- A crafted `state` pointing to an external URL is ignored; the user lands on `/tasks/bug`.
- `cd frontend && npm test` is green.
