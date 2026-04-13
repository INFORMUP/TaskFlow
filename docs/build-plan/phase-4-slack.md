# Phase 4 — Slack Integration

**Goal:** Teams receive notifications in Slack and can perform lightweight task actions without leaving their communication tool.

## Phase 4a — Notifications

- **Slack App setup**: Bot token, OAuth scopes (`chat:write`, `channels:read`, `im:write`, `users:read`).
- **Database tables**:
  - `slack_user_links`
  - `slack_channel_configs`
- **Notification triggers**: Task created, status transitioned, assigned, comment added, validation requested, task closed.
- **Channel routing**: Per-flow channels configurable by admin. DMs for assignments and review requests.
- **Rich messages**: Block Kit format with task title, flow type, status, link back to TaskFlow UI.
- **Background job queue**: BullMQ + Redis for async Slack API calls.
- **Frontend**: Slack account linking flow. Channel routing configuration (admin).

## Phase 4b — Slash Commands and Interactive Messages

- **Slash commands**: `/taskflow create`, `/taskflow status`, `/taskflow assign`, `/taskflow transition`, `/taskflow my tasks`. Permission-checked against linked TaskFlow account.
- **Interactive messages**: Approve/Reject buttons on approval-gated transitions. Comment modal. View Details deep link.
- **Event subscriptions**: `app_mention` for @TaskFlow interactions.

## Phase 4c — Thread Sync

- **Database tables**:
  - `slack_message_refs`
- **Bi-directional sync**: Slack thread replies become TaskFlow comments (attributed to linked user). TaskFlow comments post to Slack thread. Deduplication via message refs.
- **Event subscriptions**: `message.channels` for thread monitoring.

## What this validates

- Are Slack notifications useful or noisy? Which events matter?
- Do slash commands see adoption, or do people prefer the web UI?
- Is thread sync reliable enough for production use?
