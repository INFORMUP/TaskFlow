# Phase 5 — Webhooks and External Integrations

**Goal:** External services can subscribe to TaskFlow events and build their own integrations.

## Motivating use cases

Webhooks turn TaskFlow from a database-you-query into a workflow substrate where state changes drive automation. Without them, every agent or integration needs its own polling loop and carries unavoidable latency.

- **Trigger a triage agent on task creation.** `task.created` fires → Triage Bot reads the description, adds labels, picks a flow, and transitions the task to `ready`. No polling, no stale queue.
- **Kick off a coding agent on assignment.** `task.assigned` to Investigator Bot → bot clones the repo, reproduces the bug, posts findings as a comment, optionally opens a draft PR.
- **React to comments and mentions.** `task.commented` with `@triage-bot ...` → bot replies inline. Chat-like interaction without a chat integration.
- **Fan out to external systems.** Mirror events to Slack, Linear/Jira, a status dashboard, or page oncall when a P0 transitions to `blocked`.
- **CI/deploy coordination.** A task transitioning to `deployed` triggers a release-note generator; a PR merge elsewhere transitions a linked task automatically.
- **Close the loop on background agent work.** A Phase 3 background job finishes → emits an event → webhook notifies the requesting system the result is ready.

The common thread: webhooks let TaskFlow *push* state changes to consumers the moment they happen, which is what makes agent-driven workflows practical rather than polling-bound.

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
