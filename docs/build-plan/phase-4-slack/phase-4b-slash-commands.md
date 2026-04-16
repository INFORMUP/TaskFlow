# Phase 4b — Slash Commands and Interactive Messages

**Goal:** Users can act on tasks from Slack without switching to the web UI.

**Depends on:** Phase 4a (Slack app, user links).

## Backend

- **Slash commands**: `/taskflow create`, `/taskflow status`, `/taskflow assign`, `/taskflow transition`, `/taskflow my tasks`. Permission-checked against the linked TaskFlow account.
- **Interactive messages**: Approve/Reject buttons on approval-gated transitions. Comment modal. "View Details" deep link to the web UI.
- **Event subscriptions**: `app_mention` for @TaskFlow interactions.
- **Command parsing**: Shared vocabulary with the Claude Code skill (Phase 2.4) where it applies.

## Tests

- Each slash command end-to-end against a mocked Slack webhook, permission enforcement (Slack user must be linked and authorized), interactive button round-trip, app_mention handling.
