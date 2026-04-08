# Build Plan

A phased implementation plan for TaskFlow, starting with an evaluable MVP and expanding incrementally. Each phase produces a usable system that can be tested and validated before the next phase begins.

---

## Phase 1 — MVP: Core Task Management

**Goal:** A working task management system where humans can create, view, transition, and comment on tasks through a web UI and API. Enough to evaluate the core workflow model.

### Backend

- **Project scaffolding**: Fastify + TypeBox + Prisma + PostgreSQL + Vitest
- **Database tables**:
  - `teams` (seeded: Engineer, Product, User, Agent)
  - `users` (actor_type, status, display_name, email, timezone)
  - `user_teams` (multi-team membership)
  - `flows` (seeded: Bug, Feature, Improvement)
  - `flow_statuses` (seeded per flow, with sort_order)
  - `flow_transitions` (seeded: allowed transitions per flow, including backward transitions and any-status-to-Closed)
  - `tasks` (display_id, title, description, priority, resolution, assignee, soft delete)
  - `task_transitions` (immutable audit log with required note, actor_type)
  - `comments` (soft delete)
- **Auth**: Google OAuth for web UI login. JWT access + refresh tokens.
  - `oauth_connections`
- **API endpoints**:
  - `POST /api/v1/auth/callback` (OAuth callback)
  - `POST /api/v1/auth/refresh`
  - Tasks: full CRUD, filtering by flow/status/assignee/priority, cursor pagination
  - Assignments: assign/unassign (`POST/DELETE /api/v1/tasks/{task_id}/assign`)
  - Transitions: create (with required note, resolution on close), list history
  - Comments: create, list, edit (own), soft delete
  - Users/Teams: list
- **Validation**: Transition validity enforced (allowed transitions, required note, required resolution on close). Permission checks per team per flow. "Admin" permission level (used by label creation, webhook management, user listing) is granted to the Engineer team until a dedicated Admin team is introduced.
- **Tests**: Models, transition logic, permission enforcement, API endpoint integration tests.

### Frontend

- **Project scaffolding**: Vue 3 + TypeScript + Vite + Vue Router + Vitest + Playwright
- **Auth flow**: Google OAuth login, JWT token management
- **Task board view**: Kanban-style columns by status, per flow. Filter by flow type.
- **Task detail view**: Title, description, priority, assignee, current status, resolution (if closed). Transition button with required note input. Resolution selector when closing. Comment thread.
- **Task creation form**: Flow type, title, description, priority.
- **Flow audit history**: Timeline view of all transitions with actor, note, and timestamp on the task detail page.
- **Basic navigation**: Flow selector, task list/board toggle, user menu.

### What this validates

- Is the flow/status/transition model correct and usable?
- Do the status change notes provide useful audit context in practice?
- Are the permission boundaries appropriate?
- Is the resolution model (vs. separate invalid/rejected statuses) workable?

---

## Phase 2 — Agent Access and Programmatic Use

**Goal:** Agents and scripts can interact with TaskFlow via scoped API tokens. The system supports both human and automated actors.

### Backend

- **Database tables**:
  - `api_tokens` (token_hash, token_name, expires_at)
  - `scopes` (seeded lookup table)
  - `api_token_scopes` (junction)
- **API endpoints**:
  - `POST /api/v1/auth/tokens` (create scoped token)
  - `DELETE /api/v1/auth/tokens/{token_id}` (revoke)
  - `GET /api/v1/auth/tokens` (list authenticated user's tokens)
- **Auth middleware update**: Accept Bearer tokens that are API tokens (not just JWTs). Resolve user, check token scopes intersected with team permissions.
- **Rate limiting**: 100/min user, 300/min agent, 60/min integration, response headers.
- **Agent user seeding**: Create agent user records that can be assigned tasks and appear in audit trails.

### Frontend

- **Token management UI**: Create, view, revoke API tokens. Scope selection from seeded list. Show plaintext once on creation.
- **Agent actor display**: Transition history and comments show agent actors distinctly from humans (icon/badge).

### Claude Code Skill

- Basic skill for terminal interaction: `taskflow status`, `taskflow list`, `taskflow transition <id> <status>`, `taskflow create bug|feature|improvement`.
- Authenticates via API token stored in user config.

### What this validates

- Can agents meaningfully participate in task workflows?
- Is the scope model granular enough without being burdensome?
- Does the Claude Code skill feel natural for engineer workflows?

---

## Phase 3 — Collaboration Features

**Goal:** Richer interaction between participants — labels, mentions, task relationships, and user preferences.

### Backend

- **Database tables**:
  - `labels`
  - `task_labels` (junction)
  - `comment_mentions`
  - `transition_mentions`
  - `task_relationships`
  - `user_preferences`
- **API endpoints**:
  - Labels: CRUD, add/remove from tasks
  - Mentions: Parsed at write time on comment/transition creation. "Tasks where I was mentioned" query (UNION across both mention tables).
  - Task relationships: Create/delete links (parent_child, blocks, relates_to). Query related tasks.
  - User preferences: Get/update own preferences.
- **Mention parsing**: Extract `@username` from comment bodies and transition notes at write time. Validate mentioned user has view permission on the task. Store in appropriate mention table.
- **Full-text search**: PostgreSQL tsvector/GIN indexes on task title/description and transition notes. Wire up the `q` parameter on task list endpoint.

### Frontend

- **Labels**: Label picker on task creation/edit. Colored label chips on task cards. Filter by label.
- **Mentions**: `@username` autocomplete in comment and transition note inputs. Highlight mentions in rendered text.
- **Task relationships**: Link tasks from detail view. Show related/blocked/parent/child tasks.
- **User preferences page**: Notification settings, default filters.
- **Search**: Full-text search bar across tasks and transition notes.

### What this validates

- Do mentions drive useful engagement, or are they noise?
- Are task relationships sufficient for epic-like grouping, or is a formal epic model needed?
- Are the label and search features adequate for task discovery at current scale?

---

## Phase 4 — Slack Integration

**Goal:** Teams receive notifications in Slack and can perform lightweight task actions without leaving their communication tool.

### Phase 4a — Notifications

- **Slack App setup**: Bot token, OAuth scopes (`chat:write`, `channels:read`, `im:write`, `users:read`).
- **Database tables**:
  - `slack_user_links`
  - `slack_channel_configs`
- **Notification triggers**: Task created, status transitioned, assigned, comment added, validation requested, task closed.
- **Channel routing**: Per-flow channels configurable by admin. DMs for assignments and review requests.
- **Rich messages**: Block Kit format with task title, flow type, status, link back to TaskFlow UI.
- **Background job queue**: BullMQ + Redis for async Slack API calls.
- **Frontend**: Slack account linking flow. Channel routing configuration (admin).

### Phase 4b — Slash Commands and Interactive Messages

- **Slash commands**: `/taskflow create`, `/taskflow status`, `/taskflow assign`, `/taskflow transition`, `/taskflow my tasks`. Permission-checked against linked TaskFlow account.
- **Interactive messages**: Approve/Reject buttons on approval-gated transitions. Comment modal. View Details deep link.
- **Event subscriptions**: `app_mention` for @TaskFlow interactions.

### Phase 4c — Thread Sync

- **Database tables**:
  - `slack_message_refs`
- **Bi-directional sync**: Slack thread replies become TaskFlow comments (attributed to linked user). TaskFlow comments post to Slack thread. Deduplication via message refs.
- **Event subscriptions**: `message.channels` for thread monitoring.

### What this validates

- Are Slack notifications useful or noisy? Which events matter?
- Do slash commands see adoption, or do people prefer the web UI?
- Is thread sync reliable enough for production use?

---

## Phase 5 — Webhooks and External Integrations

**Goal:** External services can subscribe to TaskFlow events and build their own integrations.

### Backend

- **Database tables**:
  - `webhooks`
  - `webhook_event_subscriptions`
- **API endpoints**:
  - Webhooks: CRUD for subscriptions (admin only).
- **Webhook dispatch**: Background job sends signed payloads (HMAC-SHA256 using `secret_hash`) to subscriber URLs on matching events. Retry with exponential backoff on failure.
- **Events**: `task.created`, `task.updated`, `task.transitioned`, `task.assigned`, `task.commented`, `task.closed`, `task.deleted`.

### Frontend

- **Webhook management UI**: Create/view/delete subscriptions. Event type selector. Secret shown once on creation. Delivery log with status codes.

### What this validates

- Is the event model complete for downstream consumers?
- Are there integration patterns that would be better served by an MCP server?

---

## Phase 6 — Embedding and Advanced Integrations

**Goal:** TaskFlow content is accessible in external contexts. Agent workflows move toward autonomy.

### IFrame Embedding

- `?embed=true` query parameter strips chrome (nav, sidebar), shows task content only.
- `Content-Security-Policy` / `X-Frame-Options` headers allow embedding from configured trusted domains.
- Token-based auth via postMessage from parent frame.

### Google Docs — Smart Chips

- Google Workspace Add-on for link preview: pasting a TaskFlow URL renders a chip with task title, status, assignee.
- Read-only preview — actions stay in TaskFlow UI.

### Agent Autonomy (incremental)

- **Event-driven agent triggers**: New bug → agent auto-triages (creates transition to Investigate with note).
- **Agent workflow patterns**: Agent investigates, posts findings as transition note, surfaces to engineer for Approve.
- **Evaluate MCP**: Based on Phase 2-5 experience, assess whether an MCP server adds value beyond the existing API + skill pattern.

### OpenSpec Integration

- Link tasks to OpenSpec specification sections via `task_relationships` with a new `references` relationship type.
- When a task closes, surface the related spec section for review.
- Dependent on OpenSpec design stabilization.

---

## Phase Summary

| Phase | Scope | Tables | Key Outcome |
|-------|-------|--------|-------------|
| **1 — MVP** | Flows, tasks, transitions, comments, auth, permissions, web UI | 10 | Evaluable core workflow |
| **2 — Agent Access** | API tokens, scopes, rate limiting, Claude Code skill | 3 | Agents as participants |
| **3 — Collaboration** | Labels, mentions, relationships, preferences, search | 6 | Rich task interaction |
| **4 — Slack** | Notifications, slash commands, interactive messages, thread sync | 3 | Slack-native workflow |
| **5 — Webhooks** | Webhook subscriptions, event dispatch | 2 | External integrations |
| **6 — Embedding** | IFrames, Smart Chips, agent autonomy, OpenSpec | 0 | Extended reach |

Each phase is independently shippable and testable. Phases 4a/4b/4c can be shipped incrementally within Phase 4. Phase 6 components are independent of each other and can be prioritized based on demand.
