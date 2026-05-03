---
description: Discuss a TaskFlow task in depth — pull task, comments, linked PRs, and related code, then have an open-ended conversation. Read-only; no comments, no transitions.
argument-hint: "<task-id-or-display-id> [question]"
---

# Discuss

Load a single TaskFlow task into context and have a conversation about it. Use this when you want to *think out loud* with the task in front of you — understand the scope, sanity-check the design, weigh tradeoffs, find related code — without yet committing to any action.

This skill **does not** post comments, transition the task, or open PRs. If the discussion produces a decision, hand off to the right action skill (`/design`, `/transition`, `/implement`, `/address-review`, etc.).

## Arguments

- `$ARGUMENTS` — `<task-id-or-display-id> [optional question]`
  - Task ID: a UUID or display ID (`FEAT-2`, `BUG-1`, `IMP-3`). Prefix → flow: `FEAT`→`feature`, `BUG`→`bug`, `IMP`→`improvement`.
  - Question: optional. If supplied, answer it directly using the loaded context. If omitted, summarize the task and ask the user what they want to discuss.

## Instructions

1. **Setup**
   - Read API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`.

2. **Resolve and load the task**
   - UUID → `GET /api/v1/tasks/{id}`.
   - Display ID → derive flow from prefix, `GET /api/v1/tasks?flow=<slug>`, match `displayId`. Stop with a clear error if no match.
   - Capture `id`, `displayId`, `flow.slug`, `currentStatus.slug`, `title`, `description`, `projectIds`, `assigneeId`.

3. **Pull the surrounding context** (in parallel where possible):
   - `GET /api/v1/tasks/{id}/comments` — full comment thread, in order.
   - `GET /api/v1/tasks/{id}/pull-requests` — any linked PRs. For each, also fetch the GitHub PR via `gh pr view <number> --json title,state,body,reviews,comments` if the user might care about review state.
   - `GET /api/v1/tasks/{id}/transitions` if available — status history (skip if endpoint 404s; not every deployment has it).
   - For projects on the task: `GET /api/v1/projects/{id}` to know what product surface this lives in.

4. **Ground in the codebase**
   - Skim relevant files in the current checkout. Use the task title, description, comments, and any file paths mentioned in the design spec to find them. Read entry points from `CLAUDE.md` / top-level README if you don't know the layout.
   - For TaskFlow itself: `backend/src/routes/`, `backend/src/services/`, `frontend/src/views/`, `frontend/src/components/`, `backend/prisma/schema.prisma`.
   - Don't read the whole repo. Aim for the 3–10 files most likely to inform the discussion.

5. **Frame the response**
   - **If the user supplied a question**: answer it directly, citing comment authors / file paths / PR review state where relevant. Use `file_path:line_number` for code references.
   - **If the user did not supply a question**: produce a compact briefing:
     - One-line summary: `<displayId> — <title> (<status>, <flow>)`
     - URL: `https://taskflow.informup.org/tasks/<flow-slug>/<task-id>`
     - **Where it stands**: current status, latest activity, any linked PR's state.
     - **Key context from comments**: 2–5 bullets pulling out decisions, constraints, or open questions from the thread. Attribute quotes.
     - **Relevant code**: a short list of files/functions that this task touches or would touch, with one-line "why this is relevant" notes.
     - **What feels worth discussing**: 2–3 angles you'd flag — open design questions, scope ambiguity, missing acceptance criteria, risky areas of the codebase, etc.
     - End by asking the user what they want to dig into.

6. **Stay in conversation mode after the briefing.** Subsequent turns should keep using the loaded context to answer follow-ups. If the conversation produces a concrete next step, *name the skill* the user should run (e.g. "this sounds like a `/transition FEAT-12 design` to bounce it back") rather than doing it yourself.

## Notes

- **Read-only.** No `POST`, no `PATCH`, no comments, no transitions, no `gh pr review`. If the user says "go ahead and do it," stop and tell them which skill owns that action.
- **Cite, don't paraphrase silently.** When referencing comment content, name the author and quote the relevant sentence. When referencing code, use `path:line`. The user should be able to verify every claim quickly.
- **Don't re-summarize the design spec.** If a design comment exists, link to it (by quoting its first line) rather than restating it. Surface *gaps* and *implications* — that's where the discussion adds value.
- **Bounded code reads.** If you find yourself reading more than ~10 files, you're answering the wrong question — narrow it with the user first.
- **Bug flow note.** For `bug` tasks, the implement-equivalent stage is `resolve`, and PR-linkage / review still goes through the same endpoints. Adjust transitions you suggest accordingly.
