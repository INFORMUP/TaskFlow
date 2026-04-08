# Tech Stack

TaskFlow's tech stack prioritizes consistency with InformUp's existing projects (dashboard-backend, dashboard-frontend, RePortal) while making targeted improvements where the benefits clearly justify the change.

> **Note on dashboard-backend:** The Python/FastAPI code in that repo is deprecated. The active backend is Node.js + TypeScript + Express + Prisma. All three InformUp backends (dashboard-backend, RePortal) run on Node.js/TypeScript with Express and Prisma.

---

## Recommended Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend** | Node.js + TypeScript + Fastify | Same language/runtime as all InformUp backends. Fastify over Express for automatic OpenAPI generation, native JSON Schema validation, and encapsulated plugin architecture. |
| **Database** | PostgreSQL 16 | Matches dashboard-backend. Needed for full-text search (tsvector), JSONB fields, and robust transaction support. |
| **ORM** | Prisma | Direct match with dashboard-backend and RePortal. Handles schema migrations. |
| **Validation** | TypeBox (JSON Schema) | Single source of truth: one schema definition produces TypeScript types, request validation, and OpenAPI documentation. Replaces the Zod (dashboard-backend) / express-validator (RePortal) split. |
| **Frontend** | Vue 3 + TypeScript + Vite | Direct match with dashboard-frontend. Composition API, strong typing, fast dev server. |
| **Routing** | Vue Router 4 | Direct match with dashboard-frontend. |
| **Testing (backend)** | Vitest + Supertest | Matches dashboard-backend. Same test runner across frontend and backend. |
| **Testing (frontend)** | Vitest (unit) + Playwright (E2E) | Direct match with dashboard-frontend. Playwright is used across all InformUp repos. |
| **Auth** | JWT (access + refresh tokens) | Consistent with dashboard-backend and RePortal's JWT approach. |
| **Package Management** | npm | Matches existing tooling across all repos. |
| **AI Integration** | Anthropic SDK (Node.js) | Already used in dashboard-backend and RePortal. Required for agent capabilities. |

### Why Fastify over Express

All existing InformUp backends use Express. Fastify is a deliberate deviation justified by three concrete benefits for TaskFlow:

1. **Automatic OpenAPI generation.** Fastify's `@fastify/swagger` + TypeBox type providers generate an OpenAPI 3.1 spec directly from route schemas. This is critical for agent integration — agents consume the spec to understand available operations. With Express, OpenAPI requires separate annotations (swagger-jsdoc) or a parallel schema definition that can drift from the actual validation.

2. **Single-source-of-truth validation.** TypeBox schemas simultaneously define TypeScript types, request/response validation, and OpenAPI documentation. TaskFlow has complex validation rules (transition validity, resolution requirements, permission scoping) — maintaining these in one place eliminates drift between what the API accepts, what TypeScript expects, and what the docs say.

3. **Encapsulated plugin architecture.** Fastify plugins scope their routes, hooks, and decorators by default. This maps directly to TaskFlow's phased build plan — each phase (auth, agent tokens, Slack, webhooks) becomes a self-contained plugin that can be developed, tested, and shipped independently without middleware ordering concerns.

Additional benefits: built-in request timeout handling, automatic async error propagation (no manual try/catch per route), native WebSocket integration via `@fastify/websocket`, and route-level rate limiting via `@fastify/rate-limit`.

---

## Additions to Existing Stack

### Background Job Queue: BullMQ + Redis

**Not present in existing repos.** TaskFlow needs async background processing for:
- Slack notification delivery
- Webhook dispatch
- Agent task execution

**BullMQ** is the Node.js-native choice: Redis-backed, supports delayed/scheduled jobs, retries with backoff, and has a dashboard (Bull Board) for monitoring. Lightweight enough to start simple, capable enough to scale.

### Real-Time Updates: WebSockets (via @fastify/websocket)

**Not present in existing repos.** TaskFlow benefits from real-time status updates in the UI (e.g., when an agent transitions a task, the board updates without refresh).

`@fastify/websocket` integrates into Fastify's route and hook lifecycle — WebSocket handlers share the same auth, validation, and plugin scoping as HTTP routes.

---

## Alternatives Considered

### Python / FastAPI

The original tech stack proposal recommended Python + FastAPI based on the assumption that dashboard-backend used this stack. That assumption was incorrect — the Python code is deprecated. Choosing Python would make TaskFlow the only Python backend in the InformUp ecosystem, adding operational overhead (separate CI, deployment, and dependency tooling) without a compensating benefit. Fastify provides the same OpenAPI generation advantage while keeping the team on a single language.

### Express (from dashboard-backend, RePortal)

Express is the current standard across InformUp. It was rejected for TaskFlow because:
- No automatic OpenAPI generation — requires swagger-jsdoc or tsoa, both of which are separate annotation layers that can drift from actual validation
- Validation (Zod or express-validator) is disconnected from API documentation
- Global middleware model creates ordering-sensitive configuration; Fastify's encapsulated plugins are a better fit for TaskFlow's phased delivery

Express remains appropriate for the existing projects where migration cost would outweigh the benefits.

### SQLite (from RePortal dev mode)

Not suitable for TaskFlow's concurrent access patterns, full-text search needs, or JSONB fields.

### MySQL (from RePortal fallback)

Viable, but PostgreSQL is already used in dashboard-backend and offers better JSONB support, full-text search, and partial indexes — all of which TaskFlow's schema leverages.

---

## Embedding and Integration Considerations

### IFrame Embedding

TaskFlow's frontend can be made embeddable via IFrames with the following considerations:
- Set appropriate `X-Frame-Options` / `Content-Security-Policy` headers to allow embedding from trusted domains
- Support a `?embed=true` query parameter that hides chrome (nav, sidebar) and shows only task content
- Authentication in IFrames requires either: (a) shared auth cookies with `SameSite=None; Secure`, or (b) token-based auth passed via postMessage from the parent frame

### Google Docs Embedding

Google Docs supports embedded content via:
- **Google Workspace Add-on:** A sidebar or dialog that loads TaskFlow UI. This is the most capable option but requires Google Workspace Marketplace publishing.
- **Linked previews (Smart Chips):** When a TaskFlow URL is pasted, Google Docs can render a preview chip showing task title, status, and assignee. Requires registering as a link preview provider via Google Workspace Add-on.
- **IFrame in Google Sites:** Google Sites supports IFrame embedding. Google Docs itself does not natively support arbitrary IFrames.

**Recommendation:** Start with link preview (Smart Chip) support — it gives the best UX for the lowest effort and doesn't require users to leave Google Docs.

---

## Claude Skills / MCP / Agent Integration

### Claude Code Skill

**Recommendation: Include early.**

A Claude Code skill (or small set of skills) would let engineers interact with TaskFlow directly from their terminal. Examples:
- `/taskflow status` — view assigned tasks
- `/taskflow transition BUG-42 resolve` — update a task
- `/taskflow create bug "..."` — file a report

This is lightweight (just API calls wrapped in a skill definition), high-value, and low-risk. It aligns with how engineers already work in Claude Code.

### MCP Server

**Recommendation: Defer until agent workflows are proven.**

An MCP server would expose TaskFlow as a tool that Claude can use autonomously — reading tasks, updating statuses, creating reports. This is powerful but:
- Adds operational complexity (running and securing the MCP server)
- Permission scoping for autonomous agent access needs careful design
- The API + agent tokens already enable programmatic access

**When to introduce MCP:** Once agent-driven workflows (e.g., autonomous bug triage, investigation, and validation) are working well via API tokens and we see clear patterns that would benefit from MCP's tool-use protocol.

### Agent (Autonomous Workflow)

**Recommendation: Build incrementally.**

Agent capabilities should be layered in:
1. **Phase 1:** Agent assists on-demand (engineer triggers agent via skill/API)
2. **Phase 2:** Agent reacts to events (new bug → agent auto-triages)
3. **Phase 3:** Agent drives workflows (agent investigates, proposes fix, requests approval)

Each phase can be built with API tokens and background jobs — no new infrastructure needed until Phase 3 proves the pattern.

---

## OpenSpec Integration

Noted as future consideration. When OpenSpec's design stabilizes, TaskFlow can integrate via:
- Linking tasks to OpenSpec specification sections
- Auto-updating spec status when related tasks close
- Surfacing spec gaps when bugs indicate undocumented behavior

No current design work needed — just ensure the task schema supports external reference links (the `task_relationships` table with `relationship_type` can accommodate this).
