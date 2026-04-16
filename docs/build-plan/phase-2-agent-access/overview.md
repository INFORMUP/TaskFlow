# Phase 2 — Agent Access and Programmatic Use

**Goal:** Agents and scripts can interact with TaskFlow via scoped API tokens. The system supports both human and automated actors.

## Sub-phases

- [Phase 2.1 — Token Infrastructure](phase-2.1-token-infrastructure.md) — Tables, token CRUD endpoints, Bearer auth middleware.
- [Phase 2.2 — Rate Limiting and Agent Users](phase-2.2-rate-limiting-and-agent-users.md) — Tiered limits, response headers, agent user seeding.
- [Phase 2.3 — Token UI and Agent Display](phase-2.3-token-ui.md) — Frontend token management and agent actor badges.
- [Phase 2.4 — Claude Code Skill](phase-2.4-claude-code-skill.md) — Terminal skill for engineer workflows.

## Sequencing

2.1 is the foundation — 2.2, 2.3, and 2.4 all depend on it. 2.2 can ship in parallel with 2.3 once 2.1 is stable. 2.4 depends on 2.1 (and benefits from 2.3 for token creation UX, but can ship without it using curl for token creation).

## What this phase validates

- Can agents meaningfully participate in task workflows?
- Is the scope model granular enough without being burdensome?
- Does the Claude Code skill feel natural for engineer workflows?
