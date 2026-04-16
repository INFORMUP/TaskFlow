# Phase 2.3 — Token UI and Agent Actor Display

**Status:** ✅ Shipped 2026-04-16.

**Goal:** Users can create and manage API tokens from the web UI, and humans can tell at a glance when an agent acted on a task.

**Depends on:** Phase 2.1 (token endpoints) and Phase 2.2 (agent user seeding for distinct display).

## Frontend

- **Token management UI** (in user settings):
  - List tokens: name, scopes, created, last used, expires, revoke button.
  - Create token: name input, scope multi-select (from `GET /api/v1/scopes`), optional expiry.
  - Plaintext token shown **once** on creation, with copy-to-clipboard and a clear "you won't see this again" warning. Disappears on dismiss.
  - Revoke with confirm dialog.
- **Agent actor display**:
  - Transition history rows, comment authors, and assignee pills render agent users with a distinct badge/icon (bot glyph) and a subtle color treatment.
  - Hovering the badge surfaces the agent's display name + "Agent" label.
  - No extra disclosure inside the task detail flow — just visual distinction from humans.
- **Tests**: Token create flow (plaintext shown once then hidden on refresh), revoke round-trip, scope selection, agent badge renders for agent actors in transitions/comments/assignments.

## What this validates

- Is the plaintext-once model understandable, or do users lose tokens and complain?
- Is the agent badge informative without being noisy?
