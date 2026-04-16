# Phase 5 — Webhooks and External Integrations

**Goal:** External services can subscribe to TaskFlow events and build their own integrations.

## Backend

- **Database tables**:
  - `webhooks`
  - `webhook_event_subscriptions`
- **API endpoints**:
  - Webhooks: CRUD for subscriptions (admin only).
- **Webhook dispatch**: Background job sends signed payloads (HMAC-SHA256 using `secret_hash`) to subscriber URLs on matching events. Retry with exponential backoff on failure.
- **Events**: `task.created`, `task.updated`, `task.transitioned`, `task.assigned`, `task.commented`, `task.closed`, `task.deleted`.

## Frontend

- **Webhook management UI**: Create/view/delete subscriptions. Event type selector. Secret shown once on creation. Delivery log with status codes.

## What this validates

- Is the event model complete for downstream consumers?
- Are there integration patterns that would be better served by an MCP server?
