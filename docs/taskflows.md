# Task Flows

Task flows define the lifecycle of different types of work within TaskFlow. Each flow has its own status progression tailored to the nature of the work.

## Status Progression Model

**Recommendation: Allow backward transitions, not just forward progression.**

A strict linear progression assumes everything goes right on the first pass. In practice:
- A bug investigation might reveal the report is a duplicate — it needs to go back to analysis.
- A feature prototype might fail product review — it needs to return to design.
- Validation might uncover a regression — the task needs to re-enter resolution.

Each task flow below defines its statuses as an **ordered default progression** with **allowed backward transitions** noted. This keeps the happy path simple while accommodating real-world iteration.

All transitions are logged with timestamps, the actor (human or agent), and a **status change note**.

### Status Change Notes

Every status transition **requires** a note explaining *why* the transition is happening. These notes are the primary audit mechanism for understanding how and why a task progressed (or regressed) through its lifecycle.

**Purpose:**
- Provide an audit trail that answers "why did this task move from X to Y?"
- Enable agents and humans to communicate reasoning at each handoff point
- Support post-mortems, process improvement, and accountability
- Make backward transitions self-documenting (e.g., "Returning to Investigate — fix attempt revealed the root cause is in the auth middleware, not the session handler")

**Requirements:**
- Notes are **required** on all transitions (not optional). A transition without a note is rejected by the API.
- Notes are written by the actor performing the transition — human or agent.
- Notes are immutable once created (editable only by appending a correction, not by overwriting).
- Notes support markdown for formatting (code blocks, links, lists).
- The full history of status change notes constitutes the **flow audit log** for a task.

**Examples:**

| Transition | Actor | Note |
|------------|-------|------|
| Triage → Investigate | Agent | "Not a duplicate. Reproduced on Safari 17.2+ with OAuth redirect. Severity assessed as High — affects ~12% of users based on browser analytics." |
| Investigate → Triage | Agent | "Returning to Triage — discovered BUG-37 describes the same root cause (shared session cookie handling). Recommending merge." |
| Approve → Resolve | Engineer | "Approved. Fix approach: patch the cookie SameSite attribute in the OAuth callback handler. Agent should add regression test for Safari UA." |
| Validate → Resolve | Agent | "Validation failed — fix resolves the OAuth redirect but introduces a new failure on Firefox 124 when third-party cookies are blocked. Returning for additional fix." |
| Discuss → Closed | Product | "Rejected — this conflicts with the upcoming auth redesign (FEAT-15). Revisit after FEAT-15 ships." |

### Task Resolution

When a task moves to **Closed**, it must include a **resolution** indicating the outcome. The resolution is stored alongside the final status change note.

**Resolution values by flow:**

| Flow | Resolutions |
|------|------------|
| **Bug** | `fixed`, `invalid`, `duplicate`, `wont_fix`, `cannot_reproduce` |
| **Feature** | `completed`, `rejected`, `duplicate`, `deferred` |
| **Improvement** | `completed`, `wont_fix`, `deferred` |

**Why resolution instead of separate statuses for invalid/rejected:**
- "Invalid" and "Rejected" are *reasons for closing*, not workflow stages where meaningful work happens. No one is assigned to work on a task in "Invalid" status — it's just closed.
- Separate statuses would clutter the board and complicate transition logic (every status would need a path to "Invalid").
- A resolution enum on Closed keeps the flow progression clean while still distinguishing outcomes in reporting and filtering.
- The status change note on the closing transition provides the full context (e.g., *why* it's invalid, *what* it duplicates, *when* to revisit a deferred feature).

A task can be closed with a non-success resolution from **any status** — a bug might be closed as `invalid` from Triage, or as `wont_fix` from Approve. The status change note is especially important on these transitions to explain the reasoning.

---

## Bug

Handles reported defects — from initial triage through resolution and confirmation.

### Statuses

| # | Status | Description | Primary Actor | Backward Transitions Allowed |
|---|--------|-------------|---------------|------------------------------|
| 1 | **Triage** | Deduplicate against existing reports. Check if previously reported or resolved. Assess severity and reproducibility. | Agent | — |
| 2 | **Investigate** | Identify root cause, confirm the bug is genuine (not a false positive), and document findings. | Agent + Engineer | → Triage (if determined to be duplicate or invalid) |
| 3 | **Approve** | Surface investigation findings to engineer for review. Engineer approves the proposed fix approach or requests further investigation. | Engineer | → Investigate (if more analysis needed) |
| 4 | **Resolve** | Execute the fix via red-green regression TDD. Agent writes failing test, implements fix, confirms test passes. Human-in-the-loop as needed. | Agent + Engineer | → Investigate (if fix attempt reveals different root cause) |
| 5 | **Validate** | Confirm the bug no longer occurs and no regressions were introduced. Agent validates first, then surfaces to human for confirmation. | Agent → Engineer | → Resolve (if validation fails) |
| 6 | **Closed** | Task is resolved. Resolution field records outcome (`fixed`, `invalid`, `duplicate`, `wont_fix`, `cannot_reproduce`). Reachable from any status. | Engineer | → Validate (if bug recurs after closure) |

**Changes from original proposal:**
- Renamed "Analyze" → **Triage** — more standard terminology that better communicates the deduplication and severity-assessment nature of this step.
- Added **Closed** status with resolution enum — supports both successful fixes and early termination (invalid, duplicate, etc.) without needing separate statuses.
- Closed is reachable from **any status** — a bug found to be invalid during Triage can be closed immediately; one that can't be reproduced during Investigate can be closed from there.
- Kept "Approve" as-is — it serves an important human-in-the-loop checkpoint before code changes are made.

---

## Feature

Handles new functionality — from initial discussion through implementation and product sign-off.

### Statuses

| # | Status | Description | Primary Actor | Backward Transitions Allowed |
|---|--------|-------------|---------------|------------------------------|
| 1 | **Discuss** | Product team discusses the feature request, clarifies requirements, and decides whether to proceed. | Product | — |
| 2 | **Design** | Define the feature specification, user stories, acceptance criteria, and technical approach. | Product + Engineer | → Discuss (if requirements need clarification) |
| 3 | **Prototype** | Build a working prototype for product review. This is a proof-of-concept, not production code. | Agent + Engineer | → Design (if prototype reveals design flaws) |
| 4 | **Implement** | Build the production implementation via TDD with agent collaboration. Human-in-the-loop as needed. | Agent + Engineer | → Design (if implementation reveals spec gaps) |
| 5 | **Validate** | Engineer and/or agent confirm the implementation meets acceptance criteria and passes all tests. | Agent + Engineer | → Implement (if validation fails) |
| 6 | **Review** | Product performs final review to confirm the feature exists and behaves as expected. | Product | → Implement (if product review identifies issues) |
| 7 | **Closed** | Task is resolved. Resolution field records outcome (`completed`, `rejected`, `duplicate`, `deferred`). Reachable from any status. | Product | — |

**Changes from original proposal:**
- Added **Closed** status with resolution enum — supports both successful completion and early termination (rejected during Discuss, deferred during Design, etc.).
- Closed is reachable from **any status** — a feature rejected during Discuss doesn't need to pass through Design, Prototype, etc.
- Kept all original statuses — the progression is well-structured for the feature lifecycle.

---

## Improvement

**Recommendation: Include as additional task flow.**

Handles non-bug, non-feature work: refactoring, performance optimization, dependency updates, tech debt reduction, and documentation improvements. These don't fit cleanly into Bug or Feature flows because they typically don't require product discussion/review and may not have a "prototype" phase.

### Statuses

| # | Status | Description | Primary Actor | Backward Transitions Allowed |
|---|--------|-------------|---------------|------------------------------|
| 1 | **Propose** | Engineer or agent proposes the improvement with rationale (e.g., performance data, maintainability concern). | Engineer or Agent | — |
| 2 | **Approve** | Engineer reviews and approves the approach. | Engineer | — |
| 3 | **Implement** | Execute the improvement via TDD. | Agent + Engineer | → Approve (if implementation reveals scope change) |
| 4 | **Validate** | Confirm the improvement meets its goals and introduces no regressions. | Agent + Engineer | → Implement (if validation fails) |
| 5 | **Closed** | Task is resolved. Resolution field records outcome (`completed`, `wont_fix`, `deferred`). Reachable from any status. | Engineer | — |

**Justification:** Without this flow, tech debt and refactoring work either gets shoehorned into Bug (it's not a bug) or Feature (it doesn't need product review), making reporting and filtering unreliable. A lightweight Improvement flow keeps these tracked without unnecessary overhead.

---

## Proposal: Should other task flows exist?

### Hotfix

**Recommendation: Do not include as separate flow.**

Hotfixes are urgent bugs. Rather than a separate flow, bugs should have a **priority/severity field** (e.g., Critical, High, Medium, Low). A critical-severity bug follows the Bug flow but with expedited SLAs and potentially relaxed approval requirements (e.g., post-hoc approval). This avoids duplicating the Bug flow with minor variations.

### Epic / Initiative

**Recommendation: Do not include (yet).**

Epics group related tasks. This is better handled as a **parent-child relationship** between tasks rather than a separate flow. A task of any type can be linked to a parent task, enabling epic-like grouping without a new flow. This can be revisited if more formal epic tracking is needed.

---

## Summary of All Flows

| Flow | Purpose | Statuses |
|------|---------|----------|
| **Bug** | Defect resolution | Triage → Investigate → Approve → Resolve → Validate → Closed |
| **Feature** | New functionality | Discuss → Design → Prototype → Implement → Validate → Review → Closed |
| **Improvement** | Tech debt, refactoring, optimization | Propose → Approve → Implement → Validate → Closed |
