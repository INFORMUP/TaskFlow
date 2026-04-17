# In-app feedback widget

**Goal:** Add a floating feedback bubble (bottom-right corner) that lets any authenticated user report a bug or suggest an enhancement, plus an admin view for triaging submissions. Modeled on the proven pattern in `external/Reportal/frontend/src/components/FeedbackBubble.tsx`.

Today TaskFlow has no channel for users to surface issues or ideas from inside the app. They either context-switch to email/Slack or stay silent. A lightweight in-app widget lowers the bar to near-zero friction and gives org admins a single place to review, annotate, and export feedback.

## Reference implementation

`external/Reportal/` has a complete feedback system. Use it as a design reference — not a copy target. Key differences to account for:

- Reportal is React + Tailwind; TaskFlow is Vue 3 + scoped CSS with CSS variables.
- Reportal stores feedback per-organization; TaskFlow should do the same (use `orgId` from `request.org`).
- Reportal includes a daily digest cron — skip that; it can be added later if needed.

## Execution order

Work the phases in order. Each phase must land green on `main` before the next begins — do not stack branches. Each file is self-contained; open it and follow its instructions.

1. [`01-schema-and-api.md`](./01-schema-and-api.md) — Prisma model, migration, `POST /api/feedback` endpoint, admin endpoints, route tests.
2. [`02-feedback-bubble.md`](./02-feedback-bubble.md) — `FeedbackBubble.vue` component, API client, mount in `AppLayout.vue`, frontend tests.
3. [`03-admin-view.md`](./03-admin-view.md) — Admin feedback list view with filtering, admin notes, archive/unarchive, CSV export, frontend tests.

When a phase ships, move its file to `docs/prompts/archive/` with the `YYYY-MM-DD-` prefix per the parent `docs/prompts/CLAUDE.md` workflow. Leave this README in place until all three phases are done, then archive it too.

## Out of scope (applies to every phase)

- Email notifications or daily digest cron.
- File/screenshot attachments on feedback.
- Feedback status workflow (open/in-progress/closed) — `archivedAt` is the only lifecycle state.
- Public-facing feedback board or voting.
- Rate limiting on the submission endpoint (revisit if abuse appears).
- Dark mode (TaskFlow doesn't have dark mode yet).

## Done when (whole epic)

- Any authenticated user sees a floating bubble on every page; clicking it opens a compact form to submit a bug report or enhancement suggestion.
- Submissions are org-scoped and carry the current page URL automatically.
- Org `owner` and `admin` users can view, annotate, archive/unarchive, and CSV-export feedback from a dedicated admin view.
- `cd backend && npm test` and `cd frontend && npm test` are green.
