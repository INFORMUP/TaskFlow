# TaskFlow Terminology

Project-specific vocabulary used throughout TaskFlow's code, docs, and UI. Generic engineering terms are omitted.

## Task lifecycle

- **Task Flow / Flow** — A predefined lifecycle template for a category of work. TaskFlow ships three flows: **Bug** (defect resolution), **Feature** (new functionality), and **Improvement** (refactoring/tech debt). Every task belongs to exactly one flow and progresses through that flow's statuses.
- **Status Progression** — The ordered sequence of statuses a task moves through (e.g., Triage → Investigate → Approve → Resolve → Validate → Closed for Bugs). Forward progression follows the default order; backward transitions are allowed to accommodate real-world iteration.
- **Transition** — A single status change on a task. Transitions are validated against the flow definition and recorded immutably.
- **Status Change Note** — A required explanation of *why* a task transitioned from one status to another. Notes are immutable, support markdown, and form part of the flow audit log.
- **Flow Audit History** — The complete, immutable record of all status transitions for a task, including timestamps, actor identity, and status change notes. Primary audit mechanism for understanding task lifecycle decisions.
- **Resolution** — A closing outcome field recording *why* a task reached Closed (e.g., `fixed`, `invalid`, `duplicate`, `wont_fix`, `cannot_reproduce` for Bugs; `completed`, `rejected`, `deferred` for Features). Only populated when a task is closed.

## Statuses worth calling out

- **Triage** — First status in the Bug flow where incoming reports are deduplicated against existing tasks and assessed for severity and reproducibility. Also used as a verb.
- **Approve** — A human-in-the-loop checkpoint in Bug/Improvement flows where an engineer signs off on the proposed technical approach before any code is executed.
- **Resolve** — The implementation status. Work in Resolve follows red-green TDD: write a failing test, implement, confirm green.
- **Validate / Validation** — The status where a fix or implementation is confirmed to meet requirements without regressions. Performed first by an agent, then surfaced for human confirmation.
- **Prototype** — A Feature-flow proof-of-concept built for product review. Prototype code is not production code and may be discarded or heavily refactored before implementation.

## People & permissions

- **Team** — A permission group that determines what actions a user can perform. The four built-in teams are **Engineer**, **Product**, **User**, and **Agent**.
- **Multi-Team Membership** — A user may belong to multiple teams simultaneously, inheriting the **union** of permissions from all memberships (e.g., a tech lead who is both Engineer and Product).
- **Agent** — An AI system (e.g., Claude) modeled as a first-class team member, with its own permissions and audit identity. Agents triage, investigate, implement, and validate alongside humans.
- **Actor Type** — Classification of who performed an action: `human`, `agent`, or `system` (automated).
- **Scope** — Permission boundary controlling which tasks a team member can see/act on: `All`, `Assigned`, `Own`, or `Public`.

## Identifiers & data model

- **Display ID** — Human-readable per-flow task identifier (e.g., `BUG-42`, `FEAT-7`), distinct from the UUID primary key.
- **Soft Delete** — Deactivation via an `is_deleted` flag instead of physical row deletion, preserving audit-trail integrity.
- **Task Relationship** — A typed link between tasks (`parent_child`, `blocks`, `relates_to`) enabling epic-like grouping without introducing a separate flow.
- **Label** — A reusable tag attached to tasks via a many-to-many join, used for filtering and reporting.

## Mentions & notifications

- **Mention** — An `@username` reference inside a comment or status change note. Parsed at write time and stored as a mention record for efficient querying ("tasks where I was mentioned").
- **Comment Mention** — Mention record originating from a task comment.
- **Transition Mention** — Mention record originating from a status change note.
- **Notification Preferences** — Per-user setting controlling which task events trigger notifications: `all`, `assigned_only`, or `none`.

## API access

- **API Token** — Scoped credential for programmatic access by humans or agents. Separate from interactive OAuth login; supports per-token scopes and flexible expiration.
- **API Token Scopes** — Fine-grained permission restrictions on a single token. A token's effective permissions are the **intersection** of its scopes and the owning user's team-based permissions.

## Slack integration

- **Slack Channel Config** — Routing rules that map flow types and event types to specific Slack channels.
- **Thread Sync** — Bidirectional sync where Slack thread replies become TaskFlow comments and vice versa, with deduplication to prevent loops.
- **Message Queue** — Background job queue (BullMQ on Redis) used for outbound Slack calls so the main request path stays unblocked and rate limits are handled gracefully.
