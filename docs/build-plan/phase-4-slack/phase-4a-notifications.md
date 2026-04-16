# Phase 4a — Notifications

**Goal:** TaskFlow events surface as Slack messages in the right channels and DMs.

## Backend

- **Slack App setup**: Bot token, OAuth scopes (`chat:write`, `channels:read`, `im:write`, `users:read`).
- **Database tables**:
  - `slack_user_links` — maps TaskFlow user to Slack user.
  - `slack_channel_configs` — per-flow or per-project channel routing.
- **Notification triggers**: Task created, status transitioned, assigned, comment added, validation requested, task closed.
- **Channel routing**: Per-flow channels configurable by admin. DMs for assignments and review requests.
- **Rich messages**: Block Kit format with task title, flow type, status, link back to TaskFlow UI.
- **Background job queue**: BullMQ + Redis for async Slack API calls. Retries with backoff on Slack API errors.

## Frontend

- Slack account linking flow (OAuth redirect).
- Channel routing configuration (admin-only).

## Tests

- Event → Slack message dispatch, channel routing rules, DM routing for assignments, message formatting, job retry behavior.
