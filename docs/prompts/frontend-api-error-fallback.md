# Frontend API error fallback

**Goal:** When the backend returns an error body that doesn't match the project's canonical `{error:{code,message}}` shape, `apiFetch` should still surface a useful message instead of letting every view fall back to a generic "Failed to X" string.

## Why

`apiFetch` (`frontend/src/api/client.ts`) currently throws `{status, ...parsedJson}`. Every view reads `e?.error?.message` and falls back to a hardcoded generic message when that path is missing. This works for every hand-written error in `backend/src/plugins/error-handler.ts` and the explicit `reply.status(...).send({error:{...}})` sites in the route handlers — but it hides two categories of error from the user:

1. **Fastify defaults that bypass the error handler.** The built-in 404 body is `{"message":"Route POST:/api/v1/organizations not found","error":"Not Found","statusCode":404}`. No `error.message` — so `CreateOrgView` shows "Failed to create organization" with zero hint that the route doesn't exist. This actually happened during Phase 4 rollout when `tsx watch` didn't pick up the new route registration, and the only way to diagnose it was curling the endpoint by hand.
2. **Network / JSON-parse failures.** If `res.json()` throws or the response isn't JSON, `apiFetch` currently constructs `{error:{message: res.statusText}}`, which works — but only because of the existing catch. Worth preserving and not regressing.

The fix is small and contained to `apiFetch`; no per-view changes required.

## What to do

### `frontend/src/api/client.ts`

Change the error-normalization branch so it produces a consistent `{error:{code,message}}` shape regardless of what the server returned. Roughly:

```ts
if (!res.ok) {
  const raw = await res.json().catch(() => null);
  const message =
    raw?.error?.message ??     // canonical TaskFlow shape
    raw?.message ??            // Fastify default (404, validation, etc.)
    res.statusText ??
    `HTTP ${res.status}`;
  const code =
    raw?.error?.code ??
    raw?.code ??
    `HTTP_${res.status}`;
  throw { status: res.status, error: { code, message }, raw };
}
```

Notes:
- Keep the existing 401-refresh flow above this block unchanged.
- Include the original body as `raw` on the thrown object so future debugging (and tests that want to assert on full response bodies) don't have to re-parse.
- The `code` fallback to `HTTP_<status>` is deliberate — views that switch on `err.error.code` today (search the codebase) can keep working without needing to add a default branch.

### Tests

Add cases to `frontend/src/api/client.test.ts` (create the file if it doesn't exist — use Vitest + happy-dom, mock `globalThis.fetch`):

- Canonical `{error:{code,message}}` → re-thrown unchanged (plus `raw`).
- Fastify default 404 `{"message":"Route not found","error":"Not Found","statusCode":404}` → thrown as `{status:404, error:{code:"HTTP_404", message:"Route not found"}}`.
- Response with no parseable JSON → thrown with `message === res.statusText`.
- 401 still triggers the refresh flow (regression guard — don't let this refactor break that path).

### Out of scope

- Changing any view's error-handling code. The point of this change is exactly that views shouldn't need to.
- Logging / telemetry for unexpected error shapes. If we want that, it's a separate task.
- Backend changes to make 404s go through the error handler. Fastify's default 404 path is fine; the frontend is the right place to normalize.

## Done when

- `apiFetch` surfaces Fastify-default error bodies (verified by hitting an unknown route from the UI and seeing the backend's message instead of "Failed to X").
- New tests in `client.test.ts` cover all three body shapes and the 401 refresh path.
- `cd frontend && npm test` is green.
- No existing view's error display regresses — spot-check `CreateOrgView`, `OrganizationView`, `SettingsView`, and `LoginView` after the change.
