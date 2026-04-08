# Slack Integration

TaskFlow integrates with Slack to keep teams informed and enable lightweight task interaction without leaving their communication tool.

---

## Core Capabilities

### 1. Notifications

Push notifications to designated Slack channels or DMs when task events occur.

**Notification triggers:**
- Task created (new bug report, feature request, improvement)
- Status transition (task moves to a new status)
- Task assigned or reassigned
- Comment added to a task
- Validation requested (agent or human needs to review)
- Task closed

**Channel routing:**
- Per-flow channels (e.g., `#taskflow-bugs`, `#taskflow-features`)
- Per-team DMs for assignments and review requests
- A single `#taskflow-activity` firehose channel for high-visibility teams
- Configurable per-user notification preferences (all, assigned-only, none)

**Notification format:**
Rich Slack messages using Block Kit with:
- Task title, flow type, and current status
- Link back to TaskFlow UI
- Action buttons for quick responses (approve, comment, transition)

### 2. Slash Commands

Allow users to interact with TaskFlow directly from Slack.

| Command | Description | Example |
|---------|-------------|---------|
| `/taskflow create bug` | Create a new bug report | `/taskflow create bug "Login fails on Safari"` |
| `/taskflow create feature` | Submit a feature request | `/taskflow create feature "Dark mode support"` |
| `/taskflow status <id>` | View task status | `/taskflow status BUG-42` |
| `/taskflow assign <id> <user>` | Assign a task | `/taskflow assign BUG-42 @alice` |
| `/taskflow transition <id> <status>` | Move task to new status | `/taskflow transition BUG-42 investigate` |
| `/taskflow my tasks` | List your assigned tasks | `/taskflow my tasks` |

All slash commands respect the same permissions model defined in [permissions.md](permissions.md). A User-team member cannot run `/taskflow assign`, for example.

### 3. Interactive Messages

When a task needs human input (e.g., engineer approval, product review), TaskFlow sends an interactive message with action buttons:

- **Approve / Reject** — for approval-gated transitions
- **Comment** — opens a modal to add a comment
- **View Details** — deep link to TaskFlow UI

Button actions trigger TaskFlow API calls, authenticated via the Slack user's linked TaskFlow account.

### 4. Thread-Based Discussion

When a task notification is posted to a channel, replies in the Slack thread are synced as comments on the TaskFlow task. This allows discussion to happen naturally in Slack while preserving context in TaskFlow.

**Sync behavior:**
- Slack thread replies → TaskFlow comments (attributed to linked user)
- TaskFlow comments → Slack thread replies (posted by TaskFlow bot)
- Bi-directional sync with deduplication to prevent loops

---

## Technical Requirements

### Slack App Configuration

- **App type:** Slack App with Bot Token (not legacy webhook)
- **OAuth scopes required:**
  - `chat:write` — post messages and notifications
  - `commands` — register slash commands
  - `users:read` — resolve Slack users to TaskFlow accounts
  - `channels:read` — list channels for configuration
  - `im:write` — send DMs for assignments/reviews
- **Event subscriptions:**
  - `message.channels` — for thread sync
  - `app_mention` — for @TaskFlow interactions
- **Interactivity:** Enable for action buttons and modals

### TaskFlow Backend Requirements

- **Slack user linking:** Map Slack user IDs to TaskFlow user accounts. Provide a `/connect-slack` flow in TaskFlow UI or a `/taskflow connect` slash command.
- **Webhook endpoint:** `POST /api/v1/integrations/slack/events` to receive Slack event payloads.
- **OAuth endpoint:** `GET/POST /api/v1/integrations/slack/oauth` for app installation flow.
- **Channel configuration API:** Allow admins to configure which channels receive which notification types.
- **Message queue:** Use BullMQ + Redis (see [tech-stack.md](tech-stack.md#background-job-queue-bullmq--redis)) to handle Slack API calls without blocking the main request path. Slack rate limits are generous but bursty — queue ensures reliability.

### Database Additions

- `slack_user_links` table: maps `user_id` ↔ `slack_user_id` + `slack_team_id`
- `slack_channel_configs` table: maps flow type + event type → channel ID
- `slack_message_refs` table: maps `task_id` + `comment_id` ↔ `slack_message_ts` + `channel_id` (for thread sync and deduplication)

### Security Considerations

- Verify Slack request signatures on all incoming webhooks using the signing secret.
- Store bot tokens encrypted at rest.
- Slash command responses should not leak task details the Slack user doesn't have permission to view — check TaskFlow permissions before responding.
- Thread sync should respect comment permissions — if a Slack user isn't linked to a TaskFlow account, their thread replies should not sync.

---

## Implementation Phases

**Phase 1 — Notifications only**
- Outbound notifications for key events
- Channel routing configuration
- No interactivity, no slash commands

**Phase 2 — Slash commands + interactive messages**
- Slash command registration and handling
- Action buttons on notifications
- Slack user ↔ TaskFlow account linking

**Phase 3 — Thread sync**
- Bi-directional comment sync
- Deduplication logic
- Thread-based discussion flows
