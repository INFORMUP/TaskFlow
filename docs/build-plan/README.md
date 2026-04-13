# Build Plan

A phased implementation plan for TaskFlow, starting with an evaluable MVP and expanding incrementally. Each phase produces a usable system that can be tested and validated before the next phase begins.

- [Phase 1 — MVP: Core Task Management](phase-1-mvp.md) ✅ Complete
- [Phase 1.1 — Projects, Filtering, and View Polish](phase-1.1-projects-and-views.md)
- [Phase 1.2 — Project-Scoped Flows](phase-1.2-project-scoped-flows.md)
- [Phase 2 — Agent Access and Programmatic Use](phase-2-agent-access.md)
- [Phase 3 — Collaboration Features](phase-3-collaboration.md)
- [Phase 4 — Slack Integration](phase-4-slack.md)
- [Phase 5 — Webhooks and External Integrations](phase-5-webhooks.md)
- [Phase 6 — Embedding and Advanced Integrations](phase-6-embedding.md)

---

## Phase Summary

| Phase | Scope | Tables | Key Outcome |
|-------|-------|--------|-------------|
| **1 — MVP** ✅ | Flows, tasks, transitions, comments, auth, permissions, web UI | 10 | Evaluable core workflow |
| **1.1 — Projects & Views** | Projects entity, due dates, filters, list view, transition-time assignment | 2 | First-round product feedback addressed |
| **1.2 — Project-Scoped Flows** | Per-project flow attachment, default flow, Fundraising flows | 1 | Flows fit non-engineering domains |
| **2 — Agent Access** | API tokens, scopes, rate limiting, Claude Code skill | 3 | Agents as participants |
| **3 — Collaboration** | Labels, mentions, relationships, preferences, search | 6 | Rich task interaction |
| **4 — Slack** | Notifications, slash commands, interactive messages, thread sync | 3 | Slack-native workflow |
| **5 — Webhooks** | Webhook subscriptions, event dispatch | 2 | External integrations |
| **6 — Embedding** | IFrames, Smart Chips, agent autonomy, OpenSpec | 0 | Extended reach |

Each phase is independently shippable and testable. Phases 4a/4b/4c can be shipped incrementally within Phase 4. Phase 6 components are independent of each other and can be prioritized based on demand.
