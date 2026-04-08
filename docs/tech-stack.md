# Tech Stack

TaskFlow's tech stack prioritizes consistency with InformUp's existing projects (dashboard-backend, dashboard-frontend, RePortal) while making targeted deviations where the benefits clearly outweigh the cost of inconsistency.

---

## Recommended Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend** | Python 3.13 + FastAPI | Direct match with dashboard-backend. Async-first, automatic OpenAPI spec generation, Pydantic validation. |
| **Database** | PostgreSQL 16 | Direct match with dashboard-backend. Needed for full-text search (tsvector), JSONB fields, and robust transaction support. |
| **ORM** | SQLAlchemy 2.x + Alembic | Direct match with dashboard-backend. Alembic handles schema migrations. |
| **Frontend** | Vue 3 + TypeScript + Vite | Direct match with dashboard-frontend. Composition API, strong typing, fast dev server. |
| **Routing** | Vue Router 4 | Direct match with dashboard-frontend. |
| **Testing (backend)** | pytest + pytest-asyncio | Direct match with dashboard-backend. |
| **Testing (frontend)** | Vitest (unit) + Playwright (E2E) | Direct match with dashboard-frontend. Playwright is used across all three repos. |
| **Auth** | JWT (access + refresh tokens) | Consistent with dashboard-backend's JWT approach. |
| **ASGI Server** | Uvicorn | Direct match with dashboard-backend. |
| **Package Management** | uv (Python), npm (JS) | Matches existing tooling. |
| **AI Integration** | Anthropic SDK (Python) | Already used in dashboard-backend. Required for agent capabilities. |

---

## Deviations from Existing Stack

### Background Job Queue: Celery + Redis (or arq)

**Not present in existing repos.** TaskFlow needs async background processing for:
- Slack notification delivery
- Webhook dispatch
- Agent task execution

**Options:**
- **Celery + Redis** — battle-tested, rich ecosystem, but heavier. Better if job complexity grows.
- **arq** — lightweight, async-native (uses Redis + asyncio). Better fit for FastAPI's async model.

**Recommendation:** Start with **arq** for simplicity. Migrate to Celery only if job scheduling or complex workflows demand it.

### Real-Time Updates: WebSockets (via FastAPI)

**Not present in existing repos.** TaskFlow benefits from real-time status updates in the UI (e.g., when an agent transitions a task, the board updates without refresh).

FastAPI has native WebSocket support. No additional framework needed.

---

## Alternatives Considered and Rejected

### Node.js / Express Backend (from RePortal)

RePortal uses Express.js, but:
- dashboard-backend is the more relevant precedent (same problem domain: data-driven API)
- FastAPI's automatic OpenAPI generation is valuable for agent integration
- Type safety via Pydantic is preferable to manual validation with express-validator

### SQLite (from RePortal dev mode)

Not suitable for TaskFlow's concurrent access patterns, full-text search needs, or JSONB fields.

### MySQL (from RePortal production)

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
