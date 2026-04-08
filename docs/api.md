# API

TaskFlow exposes a RESTful API for programmatic access by Claude Code, other agents, and external applications.

---

## Design Principles

- **RESTful** with JSON request/response bodies
- **OpenAPI 3.1** spec generated automatically via Fastify's `@fastify/swagger` + TypeBox type providers
- **Authentication** via Bearer tokens (JWT)
- **Authorization** enforced per-endpoint based on team permissions (see [permissions.md](permissions.md))
- **Pagination** via cursor-based pagination for list endpoints
- **Versioning** via URL prefix (`/api/v1/`)

---

## Authentication

### Token Types

| Token Type | Issued To | Lifetime | Use Case |
|------------|-----------|----------|----------|
| **User Token** | Human users | Short-lived (1h) + refresh token | Web UI, personal API access |
| **Agent Token** | AI agents | Configurable, scoped | Claude Code, automated workflows |
| **Integration Token** | External services | Long-lived, scoped | Slack bot, CI/CD, webhooks |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/callback` | Exchange Google OAuth authorization code for JWT |
| `POST` | `/api/v1/auth/refresh` | Refresh an expired access token |
| `POST` | `/api/v1/auth/tokens` | Create a scoped API token (see token types below) |
| `GET` | `/api/v1/auth/tokens` | List tokens for the authenticated user |
| `DELETE` | `/api/v1/auth/tokens/{token_id}` | Revoke an API token |

#### Token Creation

```
POST /api/v1/auth/tokens
```

```json
{
  "token_name": "CI pipeline",
  "token_type": "integration",
  "scopes": ["tasks:read", "tasks:transition"],
  "expires_at": "2027-01-01T00:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `token_name` | string | Human-readable label |
| `token_type` | string | `user`, `agent`, or `integration` — determines rate limit tier |
| `scopes` | string[] | Permission scopes (from seeded `scopes` table). Token effective permissions = intersection of scopes and user's team permissions. |
| `expires_at` | ISO 8601 | Optional. Null for non-expiring tokens. |

**Permission to create by type:**
- `user` — any authenticated user (creates a token for themselves)
- `agent` — Engineer or Admin only (creates a token for an agent user)
- `integration` — Engineer or Admin only

Response: `201 Created` with the full token object. The plaintext token value is included **only in this response** — it cannot be retrieved later.

---

## Task Endpoints

### Core CRUD

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `GET` | `/api/v1/tasks` | List tasks (filtered, paginated) | View |
| `POST` | `/api/v1/tasks` | Create a new task | Create (per flow) |
| `GET` | `/api/v1/tasks/{task_id}` | Get task details | View |
| `PATCH` | `/api/v1/tasks/{task_id}` | Update task metadata | Edit (scoped by team) |
| `DELETE` | `/api/v1/tasks/{task_id}` | Soft-delete a task | Delete |

### Task Creation

```
POST /api/v1/tasks
```

```json
{
  "flow": "bug",
  "title": "Login fails on Safari 17",
  "description": "Users report blank screen after OAuth redirect...",
  "priority": "high",
  "created_by": "user_123"
}
```

Response: `201 Created` with full task object including generated `task_id` (e.g., `BUG-42`), initial status, and timestamps.

### Filtering and Search

```
GET /api/v1/tasks?flow=bug&status=investigate&assignee=user_456&priority=high&q=safari
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `flow` | string | Filter by flow type (`bug`, `feature`, `improvement`) |
| `status` | string | Filter by current status |
| `assignee` | string | Filter by assigned user/agent ID |
| `priority` | string | Filter by priority level |
| `labels` | string | Comma-separated label filter |
| `q` | string | Full-text search across title, description, and transition notes |
| `created_after` | ISO 8601 | Filter by creation date |
| `created_before` | ISO 8601 | Filter by creation date |
| `cursor` | string | Pagination cursor |
| `limit` | integer | Page size (default 25, max 100) |

---

## Status Transitions and Flow History

Status transitions are the core audit mechanism in TaskFlow. Every transition creates an immutable record with a **required** status change note explaining why the transition is happening.

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `POST` | `/api/v1/tasks/{task_id}/transitions` | Transition task to new status | Transition (per status) |
| `GET` | `/api/v1/tasks/{task_id}/transitions` | Get full flow audit history | View |

### Transition Request

```
POST /api/v1/tasks/BUG-42/transitions
```

```json
{
  "to_status": "investigate",
  "note": "Confirmed reproducible on Safari 17.2+. Not a duplicate. Severity assessed as High — affects ~12% of users based on browser analytics."
}
```

The `note` field is **required**. A transition without a note returns `422`.

### Closing a Task (with Resolution)

When transitioning to `closed`, a `resolution` field is also required:

```json
{
  "to_status": "closed",
  "resolution": "invalid",
  "note": "Cannot reproduce on any supported browser/OS combination. Reporter confirmed they were using an unsupported VPN proxy that modifies response headers."
}
```

Valid resolutions depend on the flow type:
- **Bug:** `fixed`, `invalid`, `duplicate`, `wont_fix`, `cannot_reproduce`
- **Feature:** `completed`, `rejected`, `duplicate`, `deferred`
- **Improvement:** `completed`, `wont_fix`, `deferred`

### Flow Audit History

```
GET /api/v1/tasks/BUG-42/transitions
```

Returns the complete, ordered history of status changes for a task:

```json
{
  "task_id": "BUG-42",
  "transitions": [
    {
      "id": "tr_001",
      "from_status": null,
      "to_status": "triage",
      "actor": { "id": "user_123", "name": "Jane", "teams": ["user"], "type": "human" },
      "note": "Login fails after OAuth redirect on Safari 17. Blank white screen. Happens every time.",
      "created_at": "2026-04-08T10:00:00Z"
    },
    {
      "id": "tr_002",
      "from_status": "triage",
      "to_status": "investigate",
      "actor": { "id": "agent_claude_01", "name": "Claude", "teams": ["agent"], "type": "agent" },
      "note": "Not a duplicate. Reproduced on Safari 17.2+ with OAuth redirect. Severity assessed as High — affects ~12% of users based on browser analytics.",
      "created_at": "2026-04-08T10:05:00Z"
    },
    {
      "id": "tr_003",
      "from_status": "investigate",
      "to_status": "approve",
      "actor": { "id": "agent_claude_01", "name": "Claude", "teams": ["agent"], "type": "agent" },
      "note": "Root cause identified: SameSite cookie attribute not set on OAuth callback. Proposed fix: set SameSite=None; Secure on session cookie in auth middleware.",
      "created_at": "2026-04-08T10:20:00Z"
    }
  ],
  "pagination": { "cursor": "...", "has_more": false }
}
```

### Actor Types

The `type` field on actor objects identifies the kind of entity that performed the action:

| Type | Description |
|------|-------------|
| `human` | A human user (engineer, product, end user) |
| `agent` | An AI agent (e.g., Claude) |
| `system` | An automated system action (e.g., auto-close on timeout, scheduled deduplication). System actors have no associated user identity — the `id` field references a sentinel system user. |

Supports filtering:
- `?actor_type=agent` — show only agent transitions
- `?actor_type=human` — show only human transitions
- `?actor_type=system` — show only system-initiated transitions
- `?from_status=validate&to_status=resolve` — show only specific backward transitions (useful for tracking rework)

The API validates:
- The transition is valid for the task's current status and flow
- The authenticated user/agent has permission to trigger this transition
- A note is provided (non-empty string)
- A resolution is provided when transitioning to `closed`
- Returns `422` with details if any validation fails

---

## Comments

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `GET` | `/api/v1/tasks/{task_id}/comments` | List comments | View |
| `POST` | `/api/v1/tasks/{task_id}/comments` | Add a comment | Comment |
| `PATCH` | `/api/v1/tasks/{task_id}/comments/{comment_id}` | Edit a comment | Comment (own only) |
| `DELETE` | `/api/v1/tasks/{task_id}/comments/{comment_id}` | Delete a comment | Comment (own) or Delete |

---

## Assignments

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `POST` | `/api/v1/tasks/{task_id}/assign` | Assign task to user/agent | Assign |
| `DELETE` | `/api/v1/tasks/{task_id}/assign` | Unassign task | Assign |

```json
{
  "assignee_id": "user_456",
  "note": "Assigning for investigation — expertise in auth flow"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assignee_id` | string | Yes | User or agent ID to assign |
| `note` | string | No | Optional context for the assignment. Stored as a comment on the task if provided. |

---

## Labels

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `GET` | `/api/v1/labels` | List all labels | View |
| `POST` | `/api/v1/labels` | Create a label | Admin |
| `POST` | `/api/v1/tasks/{task_id}/labels` | Add labels to task | Edit |
| `DELETE` | `/api/v1/tasks/{task_id}/labels/{label_id}` | Remove label from task | Edit |

---

## Task Relationships

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `GET` | `/api/v1/tasks/{task_id}/relationships` | List related tasks | View |
| `POST` | `/api/v1/tasks/{task_id}/relationships` | Create a relationship | Edit |
| `DELETE` | `/api/v1/tasks/{task_id}/relationships/{relationship_id}` | Remove a relationship | Edit |

```json
{
  "related_task_id": "BUG-37",
  "relationship_type": "parent_child"
}
```

Valid `relationship_type` values: `parent_child`, `blocks`, `relates_to`.

---

## Mentions

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `GET` | `/api/v1/users/{user_id}/mentions` | List tasks where the user was mentioned | View (own) or Admin |

Returns tasks where the user was `@mentioned` in comments or transition notes. Results are the union of `comment_mentions` and `transition_mentions`, deduplicated by task.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | string | Filter by mention source: `comment`, `transition`, or omit for both |
| `cursor` | string | Pagination cursor |
| `limit` | integer | Page size (default 25, max 100) |

---

## User Preferences

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `GET` | `/api/v1/users/{user_id}/preferences` | Get user preferences | View (own) or Admin |
| `PATCH` | `/api/v1/users/{user_id}/preferences` | Update user preferences | Edit (own) or Admin |

```json
{
  "notification_level": "assigned_only",
  "notify_on_mention": true,
  "notify_on_assignment": true,
  "notify_on_status_change": false,
  "default_flow_filter": "bug",
  "default_priority_filter": null
}
```

---

## Users and Teams

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `GET` | `/api/v1/users` | List users | Admin or Engineer |
| `GET` | `/api/v1/users/{user_id}` | Get user profile | View (own) or Admin |
| `GET` | `/api/v1/teams` | List teams | View |
| `GET` | `/api/v1/teams/{team_id}/members` | List team members | View |

---

## Webhooks

Allow external services to subscribe to TaskFlow events.

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `GET` | `/api/v1/webhooks` | List webhook subscriptions | Admin |
| `POST` | `/api/v1/webhooks` | Create a webhook subscription | Admin |
| `DELETE` | `/api/v1/webhooks/{webhook_id}` | Remove a webhook | Admin |

### Webhook Payload

```json
{
  "event": "task.transitioned",
  "task_id": "BUG-42",
  "flow": "bug",
  "from_status": "triage",
  "to_status": "investigate",
  "actor": { "id": "agent_claude_01", "teams": ["agent"] },
  "timestamp": "2026-04-08T14:30:00Z"
}
```

Events: `task.created`, `task.updated`, `task.transitioned`, `task.assigned`, `task.commented`, `task.closed`, `task.deleted`

---

## Slack Integration

Endpoints for the Slack app integration. See [slack-integration.md](slack-integration.md) for full design details.

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| `POST` | `/api/v1/integrations/slack/events` | Receive Slack event payloads (verified via signing secret) | — |
| `GET` | `/api/v1/integrations/slack/oauth` | Initiate Slack app OAuth installation | Admin |
| `POST` | `/api/v1/integrations/slack/oauth` | Complete Slack app OAuth callback | Admin |

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "TRANSITION_NOT_ALLOWED",
    "message": "Cannot transition from 'triage' to 'resolve' — must pass through 'investigate' and 'approve' first.",
    "details": {
      "current_status": "triage",
      "requested_status": "resolve",
      "allowed_transitions": ["investigate"]
    }
  }
}
```

| HTTP Status | Meaning |
|-------------|---------|
| `400` | Bad request (malformed input) |
| `401` | Not authenticated |
| `403` | Authenticated but insufficient permissions |
| `404` | Resource not found |
| `422` | Validation error (e.g., invalid transition) |
| `429` | Rate limited |

---

## Rate Limiting

- **User tokens:** 100 requests/minute
- **Agent tokens:** 300 requests/minute (agents are expected to be more active)
- **Integration tokens:** 60 requests/minute

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
