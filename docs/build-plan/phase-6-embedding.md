# Phase 6 — Embedding and Advanced Integrations

**Goal:** TaskFlow content is accessible in external contexts. Agent workflows move toward autonomy.

## IFrame Embedding

- `?embed=true` query parameter strips chrome (nav, sidebar), shows task content only.
- `Content-Security-Policy` / `X-Frame-Options` headers allow embedding from configured trusted domains.
- Token-based auth via postMessage from parent frame.

## Google Docs — Smart Chips

- Google Workspace Add-on for link preview: pasting a TaskFlow URL renders a chip with task title, status, assignee.
- Read-only preview — actions stay in TaskFlow UI.

## Agent Autonomy (incremental)

- **Event-driven agent triggers**: New bug → agent auto-triages (creates transition to Investigate with note).
- **Agent workflow patterns**: Agent investigates, posts findings as transition note, surfaces to engineer for Approve.
- **Evaluate MCP**: Based on Phase 2-5 experience, assess whether an MCP server adds value beyond the existing API + skill pattern.

## OpenSpec Integration

- Link tasks to OpenSpec specification sections via `task_relationships` with a new `references` relationship type.
- When a task closes, surface the related spec section for review.
- Dependent on OpenSpec design stabilization.
