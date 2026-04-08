# Users

Users are the identity model in TaskFlow — every actor in the system (human or agent) is represented as a user. Users are distinct from teams: a user *is* an identity, a team *is* a permission group. Users can belong to multiple teams.

---

## User Identity

All actors share a single `users` table. This keeps foreign keys consistent — every transition, comment, and assignment references one table.

| Field | Description |
|-------|-------------|
| `id` | UUID primary key |
| `display_name` | Human-readable name (e.g., "Jane Chen", "Claude Bug Triage") |
| `email` | Email address. Required for human users, null for agents. |
| `actor_type` | `human` or `agent` — distinguishes identity type system-wide |
| `status` | Lifecycle state (see below) |
| `timezone` | IANA timezone string (e.g., `America/New_York`). Used for timestamp display. Null for agents. |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |

No `is_agent` flag — `actor_type` serves this purpose everywhere (on the user record, in transition history, in API responses).

---

## User Lifecycle

| Status | Description | Applies To |
|--------|-------------|------------|
| **invited** | Account created, activation email sent, not yet logged in. | Human only |
| **active** | Normal access. Can authenticate and perform actions per team permissions. | Human + Agent |
| **deactivated** | Cannot authenticate. All history preserved for audit integrity. Reassignable tasks should be surfaced to team leads. | Human + Agent |

Agents skip the `invited` state — they are created directly as `active` by an engineer or admin.

Deactivation is an administrative action, not a deletion. A deactivated user's name still appears in transition history, comments, and assignments. Deactivated users cannot be assigned new tasks.

---

## Team Membership

Users can belong to **multiple teams** and inherit the union of permissions across all memberships.

Modeled via a `user_teams` junction table:

| Field | Description |
|-------|-------------|
| `user_id` | FK → users |
| `team_id` | FK → teams |
| `is_primary` | Boolean. One team is marked primary — used as the default for display and reporting. |
| `granted_at` | Timestamp when membership was added |
| `granted_by` | FK → users. Who added this membership. |

**Examples:**
- A tech lead belongs to both Engineer and Product teams — they can approve fixes *and* perform final feature reviews.
- An agent belongs to the Agent team only.
- A user who transitions from the User team to Engineer keeps both memberships (or has the old one removed, depending on intent).

**Audit implications:** When a user performs a transition, the system records which user did it. If a user belongs to multiple teams, the transition is valid if *any* of their team memberships grants the required permission. The transition log records the user, not the team — the permission check is reconstructable from the user's team memberships at that point in time.

---

## Authentication

Authentication is modeled separately from user identity via dedicated tables per auth type. No local/password authentication — human users authenticate via Google OAuth (web UI) or API tokens (CLI/scripts), agents via API tokens only.

### OAuth Connections

Links human users to OAuth providers for web UI authentication.

| Field | Description |
|-------|-------------|
| `id` | UUID primary key |
| `user_id` | FK → users |
| `provider` | OAuth provider enum. Currently `google`. Structured for future providers without schema changes. |
| `provider_user_id` | Provider-specific subject ID (e.g., Google subject claim). |
| `last_used_at` | Timestamp of last successful login via this provider. |
| `created_at` | Timestamp |

Unique constraint on `(user_id, provider)` — one connection per provider per user.

### API Tokens

Scoped tokens for programmatic access by both humans and agents.

| Field | Description |
|-------|-------------|
| `id` | UUID primary key |
| `user_id` | FK → users |
| `token_hash` | SHA-256 hash of the token value. Unique. Plaintext shown once at creation. |
| `token_name` | Human-readable label (e.g., "CI pipeline", "Claude Bug Triage"). |
| `token_type` | Token category: `user`, `agent`, or `integration`. Determines rate limit tier (see [api.md](api.md#rate-limiting)). |
| `expires_at` | Nullable. Tokens without expiration are long-lived. |
| `last_used_at` | Timestamp of last successful authentication. |
| `created_at` | Timestamp |

A user can have multiple tokens with different scopes and lifetimes.

### API Token Scopes

Scopes restrict what an API token can do. Valid scopes are defined in a `scopes` lookup table (seeded on deployment), and assigned to tokens via an `api_token_scopes` junction table.

**Scopes lookup table:**

| Field | Description |
|-------|-------------|
| `id` | UUID primary key |
| `slug` | Unique scope identifier (e.g., `tasks:read`, `tasks:create`, `tasks:transition`, `comments:create`) |
| `description` | Human-readable explanation (e.g., "Read task details and list tasks") |
| `created_at` | Timestamp |

**API token scopes junction:**

| Field | Description |
|-------|-------------|
| `api_token_id` | FK → api_tokens |
| `scope_id` | FK → scopes |

Composite primary key on `(api_token_id, scope_id)`.

The lookup table ensures scope strings are consistent and valid — new scopes are added via migration, and the UI can enumerate available scopes when creating a token.

A token's effective permissions are the **intersection** of its scopes and the user's team-based permissions — a token can restrict but never exceed the user's access.

### Auth by Actor Type

| Method | Human | Agent |
|--------|-------|-------|
| **Google OAuth** | Yes | No |
| **API Token** | Yes | Yes |

- Human users authenticate via Google OAuth for the web UI and optionally API tokens for CLI/scripts.
- Agent users authenticate exclusively via API tokens.
- A human user can have both an OAuth connection and multiple API tokens simultaneously.

---

## User Preferences

Stored in a dedicated `user_preferences` table rather than JSONB to keep the schema normalized and queryable.

| Field | Description |
|-------|-------------|
| `id` | UUID primary key |
| `user_id` | FK → users (unique — one preferences row per user) |
| `notification_level` | `all`, `assigned_only`, `none` — controls which task events generate notifications |
| `notify_on_mention` | Boolean. Receive notification when @mentioned in a comment. Default `true`. |
| `notify_on_assignment` | Boolean. Receive notification on task assignment. Default `true`. |
| `notify_on_status_change` | Boolean. Receive notification when an assigned task changes status. Default `true`. |
| `default_flow_filter` | Nullable. Default flow type to show in task list (e.g., `bug`). |
| `default_priority_filter` | Nullable. Default priority filter. |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |

Preferences are created with defaults when a user account is activated. Agent users get a preferences row too (primarily for notification routing to Slack channels).

---

## Mentions

Users can be mentioned via `@username` syntax in comments and status change notes. Mentions are parsed at write time and stored in dedicated tables (`comment_mentions` and `transition_mentions`) rather than resolved at render time. This makes mentions queryable, indexable, and able to trigger notifications.

### Behavior

- **Parse on write**: When a comment or transition note is created, `@username` references are parsed, resolved to user IDs, and stored as mention records.
- **Permission-gated**: A mention is only stored if the mentioned user has view permission on the task. Mentioning a user who can't see the task is silently ignored — this avoids leaking task existence.
- **Notification**: Stored mentions trigger a notification to the mentioned user if `user_preferences.notify_on_mention` is `true`. If the user has a linked Slack account, the notification is delivered as a Slack DM.
- **Self-mentions**: Mentioning yourself does not trigger a notification.
- **Deactivated users**: Mentions of deactivated users are parsed and stored (for completeness) but do not trigger notifications.
- **Query**: "Tasks where I was mentioned" queries UNION across both mention tables, using the denormalized `task_id` for efficient lookup.

### Future extension

Mentions in task descriptions may be added later. Since descriptions are mutable, this would require re-parsing and diffing mentions on edit — more complex than the immutable comment/transition case. Deferred until there's a clear need.

---

## Summary of Schema Changes

This document introduces or modifies the following tables:

| Table | Change |
|-------|--------|
| `users` | Replace `team_id` FK with `actor_type` enum. Remove single-team assumption. |
| `user_teams` | **New.** Junction table for multi-team membership. |
| `oauth_connections` | **New.** Google OAuth links for human users. |
| `api_tokens` | **New.** Scoped API tokens for humans and agents. Replaces `agent_tokens`. |
| `scopes` | **New.** Lookup table of valid permission scopes. Seeded on deployment. |
| `api_token_scopes` | **New.** Junction table linking tokens to scopes. |
| `user_preferences` | **New.** Notification and display preferences. |
| `comment_mentions` | **New.** Tracks @mentions in comments. |
| `transition_mentions` | **New.** Tracks @mentions in status change notes. |
| `agent_tokens` | **Removed.** Replaced by `api_tokens` + `api_token_scopes`. |
