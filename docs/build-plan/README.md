# Build Plan

A phased implementation plan for TaskFlow, starting with an evaluable MVP and expanding incrementally. Each phase produces a usable system that can be tested and validated before the next phase begins.

Each phase lives in its own subdirectory. `overview.md` inside that directory is the phase's core plan; sub-phases are sibling files alongside it.

- [Phase 1 — MVP: Core Task Management](phase-1-mvp/overview.md) ✅ Complete
  - [Phase 1.1 — Projects, Filtering, and View Polish](phase-1-mvp/phase-1.1-projects-and-views.md) ✅ Shipped
  - [Phase 1.2 — Project-Scoped Flows](phase-1-mvp/phase-1.2-project-scoped-flows.md) ✅ Shipped
- [Phase 2 — Agent Access and Programmatic Use](phase-2-agent-access/overview.md)
  - [Phase 2.1 — Token Infrastructure](phase-2-agent-access/phase-2.1-token-infrastructure.md) ✅ Shipped
  - [Phase 2.2 — Rate Limiting and Agent Users](phase-2-agent-access/phase-2.2-rate-limiting-and-agent-users.md) ✅ Shipped
  - [Phase 2.3 — Token UI and Agent Display](phase-2-agent-access/phase-2.3-token-ui.md) ✅ Shipped
  - [Phase 2.4 — Claude Code Skill](phase-2-agent-access/phase-2.4-claude-code-skill.md)
- [Phase 3 — Collaboration Features](phase-3-collaboration/overview.md)
- [Phase 4 — Slack Integration](phase-4-slack/overview.md)
  - [Phase 4a — Notifications](phase-4-slack/phase-4a-notifications.md)
  - [Phase 4b — Slash Commands and Interactive Messages](phase-4-slack/phase-4b-slash-commands.md)
  - [Phase 4c — Thread Sync](phase-4-slack/phase-4c-thread-sync.md)
- [Phase 5 — Webhooks and External Integrations](phase-5-webhooks/overview.md)
- [Phase 6 — Embedding and Advanced Integrations](phase-6-embedding/overview.md)

---

## Phase Summary

| Phase | Scope | Tables | Key Outcome |
|-------|-------|--------|-------------|
| **1 — MVP** ✅ | Flows, tasks, transitions, comments, auth, permissions, web UI | 10 | Evaluable core workflow |
| **1.1 — Projects & Views** ✅ | Projects entity, due dates, filters, list view, transition-time assignment | 2 | First-round product feedback addressed |
| **1.2 — Project-Scoped Flows** ✅ | Per-project flow attachment, default flow, Fundraising flows | 1 | Flows fit non-engineering domains |
| **2 — Agent Access** | API tokens, scopes, rate limiting, Claude Code skill (split into 2.1–2.4) | 3 | Agents as participants |
| **3 — Collaboration** | Labels, mentions, relationships, preferences, search | 6 | Rich task interaction |
| **4 — Slack** | Notifications, slash commands, interactive messages, thread sync (split into 4a–4c) | 3 | Slack-native workflow |
| **5 — Webhooks** | Webhook subscriptions, event dispatch | 2 | External integrations |
| **6 — Embedding** | IFrames, Smart Chips, agent autonomy, OpenSpec | 0 | Extended reach |

Each phase is independently shippable and testable. Sub-phases within a phase can be shipped incrementally in the order documented in that phase's `README.md`. Phase 6 components are independent of each other and can be prioritized based on demand.
