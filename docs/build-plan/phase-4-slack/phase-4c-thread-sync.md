# Phase 4c — Thread Sync

**Goal:** Slack thread replies on a TaskFlow notification become comments on the task, and vice versa.

**Depends on:** Phase 4a (notification messages are the threads being synced into).

## Backend

- **Database tables**:
  - `slack_message_refs` — maps Slack message timestamps to TaskFlow comment IDs for deduplication and reverse lookup.
- **Bi-directional sync**:
  - Slack → TaskFlow: thread replies on a notification message become TaskFlow comments, attributed to the linked user (or a generic "Slack" author if unlinked).
  - TaskFlow → Slack: new comments on a task post to the original notification thread.
  - Deduplication via `slack_message_refs` — never re-sync a message we originated.
- **Event subscriptions**: `message.channels` for thread monitoring.

## Tests

- Round-trip sync (Slack reply → TaskFlow comment → no re-echo back to Slack), unlinked user attribution, deduplication under retry, out-of-order delivery.

## Risks

- Message loop via dedup failure. Defensive: every synced message carries a source marker checked before dispatch.
- Slack rate limits on high-traffic tasks. Batch or coalesce if thread gets hot.
