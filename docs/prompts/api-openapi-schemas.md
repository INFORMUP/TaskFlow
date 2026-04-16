# Populate OpenAPI schemas across all routes

**Goal:** The backend now serves Swagger UI at `/docs` and the OpenAPI JSON at `/docs/json` (wired via `@fastify/swagger` + `@fastify/swagger-ui` in `backend/src/app.ts`). But routes have no Fastify schemas attached, so the spec lists paths with no parameters, request bodies, or responses — the page is a shell. Fill in per-route schemas so `/docs` becomes a real, usable API reference.

## Precondition

`@fastify/swagger` and `@fastify/swagger-ui` are already registered and `@fastify/type-provider-typebox` + `@sinclair/typebox` are already in `package.json`. No new deps required.

## What to do

- Attach the TypeBox type provider to the Fastify instance in `backend/src/app.ts` so routes can use `Type.Object(...)` schemas and have request bodies/params typed automatically:
  ```ts
  import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();
  ```
  (Update the `createApp` return type accordingly; adjust test helpers if they import the app type.)

- For every endpoint in `backend/src/routes/*.ts` (33 total across 11 files), add a `schema` option with:
  - `summary` and `tags` (group by resource: `auth`, `api-tokens`, `users`, `teams`, `projects`, `flows`, `tasks`, `transitions`, `assignments`, `comments`, `health`).
  - `params` schema where the route has `:id` / `:commentId` / etc.
  - `querystring` schema where the handler reads `request.query`.
  - `body` schema where the handler reads `request.body`.
  - `response` schemas keyed by status code, at minimum for the success case and the common error cases (`400`, `401`, `403`, `404`, `409`). Define a shared `ErrorResponse` schema once and reuse it.
  - `security: [{ bearerAuth: [] }]` on non-public routes (Swagger inherits the global default, so this is mainly for documentation completeness and for any route needing `security: []` to opt out, e.g. `/health`, `/api/v1/auth/callback`, `/api/v1/auth/refresh`).

- Delete hand-rolled validation that the schema now covers. The `error-handler` plugin already turns Fastify validation errors into the project's `{error: {code, message, details}}` shape via `error.validation`, so validation failures land as `FST_ERR_VALIDATION` with the offending fields in `details`.

- Update integration tests that assert on removed error codes (e.g. `BAD_REQUEST` from `tasks.ts` / `api-tokens.ts` manual checks). They should assert the new shape: `statusCode: 400` and `code: "FST_ERR_VALIDATION"` (or accept either via a regex during transition). Update seed data / test factories only if a schema reveals a field mismatch.

- Ship incrementally, one route file per commit, running `npm test` after each. This bounds the blast radius if a schema turns out to be wrong in a subtle way (e.g. a response field that callers actually depend on but the schema strips).

## Suggested order

1. `health.ts` — trivial, proves the type provider works.
2. `api-tokens.ts` — self-contained, small, covers body + params + response.
3. `auth.ts` — public routes, covers `security: []`.
4. `teams.ts`, `flows.ts`, `users.ts` — short files.
5. `projects.ts`, `assignments.ts`, `comments.ts`, `transitions.ts` — medium.
6. `tasks.ts` — largest (353 lines, 7 endpoints including the querystring-heavy `GET /tasks`).

## Out of scope

- Changing any route's URL, status code, or success response shape. Schemas describe what exists, they don't redesign it.
- Adding new endpoints or new error cases.
- Generating a typed client from the spec (separate prompt if desired).
- Rate-limit headers / content negotiation / versioning docs beyond what's already in the global OpenAPI `info` block.

## Done when

- `/docs` shows every route with summary, tags, parameters, request body (where applicable), and response schemas for success + errors.
- `/docs/json` validates as OpenAPI 3.0 (e.g. paste into editor.swagger.io and confirm no errors).
- `cd backend && npm test` is green.
- No handler still hand-validates a field that its schema already marks required.
