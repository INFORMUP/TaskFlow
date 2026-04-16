# Phase 2.2 — Rate Limiting and Agent Users

**Status:** ✅ Shipped 2026-04-16.

**Goal:** Protect the API against runaway agents, and make agents first-class participants in the task model (assignable, visible in audit trails).

**Depends on:** Phase 2.1 (needs token metadata to tier rate limits; needs the `users.actor_type = agent` field already in place from Phase 1).

## Backend

- **Rate limiting** (per authenticated principal):
  - Human user (JWT): 100 requests/min
  - Agent user (API token on agent account): 300 requests/min
  - Integration (API token on human account used for scripts): 60 requests/min
  - Tier chosen by the token's owning user's `actor_type` plus a per-token `integration` flag (see 2.1 — add if not already there).
  - Response headers on every request: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
  - 429 with `Retry-After` when exceeded.
- **Agent user seeding**:
  - Seed a small set of agent user records (e.g. `triage-bot`, `investigator-bot`) on the Agent team with `actor_type = 'agent'`.
  - Agent users can be assigned tasks, appear in transition history, and show up in comment author lists — same surface area as humans.
  - Agent users do not log in via OAuth; their only credential is an API token issued by an admin.
- **Tests**: Rate limits per tier, header accuracy, 429 behavior, agent user assignability, transition/comment attribution for agents.

## What this validates

- Are the tier limits right, or do some agent workloads need bursting?
- Is one shared agent account enough, or do teams want per-agent-role identities (triage vs. investigator) in audit trails?
