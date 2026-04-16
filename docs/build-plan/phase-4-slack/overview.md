# Phase 4 — Slack Integration

**Goal:** Teams receive notifications in Slack and can perform lightweight task actions without leaving their communication tool.

## Sub-phases

- [Phase 4a — Notifications](phase-4a-notifications.md) — Outbound messages for task events, channel routing, DMs.
- [Phase 4b — Slash Commands and Interactive Messages](phase-4b-slash-commands.md) — Inbound `/taskflow` commands and approve/reject buttons.
- [Phase 4c — Thread Sync](phase-4c-thread-sync.md) — Bi-directional comment/thread synchronization.

## Sequencing

4a ships first and is independently valuable. 4b depends on the Slack app setup from 4a but is otherwise independent. 4c depends on 4a's message infrastructure and is the most complex — evaluate adoption of 4a/4b before committing.

## What this phase validates

- Are Slack notifications useful or noisy? Which events matter?
- Do slash commands see adoption, or do people prefer the web UI?
- Is thread sync reliable enough for production use?
