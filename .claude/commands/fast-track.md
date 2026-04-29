---
description: Fast-track a TaskFlow task from its current status (discuss/design/prototype/implement) all the way to `validate` in one go — design spec, implementation, PR, transitions
argument-hint: "<task-id-or-display-id>"
---

# Fast-track

Take a `feature`-flow task from wherever it currently sits (`discuss`, `design`, `prototype`, or `implement`) and drive it to `validate` in a single invocation. This composes `/design` + `/implement` + the intervening transitions. Use it when you already have enough context to do design and implementation back-to-back without waiting for human review at each gate.

This skill is a deliberate shortcut around the per-stage human review points the individual skills preserve. Only use it when:
- The task is small/well-understood enough that a single agent can sensibly carry it end-to-end.
- You (the token user) hold the team memberships needed for every transition involved (see "Permission map" below).
- The user has explicitly asked for a fast-track, not a careful staged walk.

If any of those don't hold, stop and use `/design`, `/implement`, `/transition` individually instead.

## Arguments

- `$ARGUMENTS` — task ID (UUID) or display ID (e.g. `FEAT-2`). If omitted, ask.

## Permission map (feature flow)

The token user must be on a team allowed for *every* transition the run will perform. The TaskFlow server is the source of truth (the permission matrix lives in its `permission.service.ts`). Today:

- `feature.design` → `product`
- `feature.prototype` → `engineer` or `agent`
- `feature.implement` → `engineer` or `agent`
- `feature.validate` → `engineer` or `agent`

If a transition 403s mid-run, **stop**. Do not roll back. Surface the failing transition, the task's current status, and what the user needs to do (mint a token with broader team membership, or hand off to someone who has it).

## Instructions

1. **Setup**
   - Read API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`.
   - GitHub repo: derive from the task's linked code repo if set; otherwise use the current checkout's `origin` (`git remote get-url origin`). Do not assume `INFORMUP/TaskFlow`.

2. **Resolve task + sanity-check**
   - Resolve UUID or display ID (`FEAT` → `feature`). Fast-track is only for the `feature` flow — if the task is on `bug` or `improvement`, stop and tell the user to use the per-stage skills (those flows have different stages and this composition doesn't map cleanly).
   - `GET /api/v1/tasks/{id}` and `GET /api/v1/tasks/{id}/comments`.
   - Note `currentStatus.slug`. The skill is valid from `discuss`, `design`, `prototype`, or `implement`. From `validate` or later, stop — there is nothing left to fast-track.

3. **Confirm with the user (conditionally)**
   - Print: starting status, target status (`validate`), and the list of transitions + work this run will perform.
   - **Skip the confirmation prompts if the task description already reads as a complete scoping pass** — i.e. it contains substantive Problem (or Context), Proposal (or Approach), and Acceptance criteria sections, and ideally Out-of-scope. In that case, treat the description itself as the human checkpoint and proceed without asking. Just print the plan and start.
   - Otherwise (thin/ambiguous description, or no acceptance criteria stated), ask for explicit confirmation before doing anything mutating. This is the human checkpoint the skill falls back to when the description doesn't carry its own.

4. **Stage: `discuss` → `design` (if needed)**
   - Only runs if `currentStatus.slug == "discuss"`.
   - The actual product-side discussion in `discuss` is normally a human gate. Fast-tracking past it requires evidence that the conversation has already happened. **If the description already reads as a complete scoping pass (per step 3's bar), treat that as the evidence and proceed without re-prompting.** Otherwise, prompt: "Has the discuss-stage scoping been done already? y/N" — if no, stop.
   - `POST /api/v1/tasks/{id}/transitions` with `{"toStatus":"design"}`. No filler note — the design spec posted in step 5 is the real signal.
   - Requires `product` team. 403 → stop.

5. **Stage: design work + `design` → `prototype`**
   - Only runs if status is now `design`.
   - Do the full `/design` work: read task + comments + relevant code, write the design spec (Goal / User stories / Acceptance criteria / Technical approach / Out of scope / Open questions), `POST /api/v1/tasks/{id}/comments` with the spec body. **Do not skimp** — the spec's acceptance criteria become the contract for the implementation and validation steps below.
   - If the spec ends up with material **Open questions** that block implementation, stop. Leave the task in `design` and tell the user the fast-track can't proceed without those answered. Don't paper over open questions to keep moving.
   - `POST /api/v1/tasks/{id}/transitions` with `{"toStatus":"prototype"}`. Requires `engineer` or `agent`. The just-posted design spec is the signal.

6. **Stage: `prototype` → `implement`**
   - Only runs if status is now `prototype`.
   - Fast-track does **not** do separate prototype work — the design spec from step 5 is treated as sufficient. If you genuinely need a prototype (spike, throwaway exploration), stop and use `/transition` manually instead; this skill is wrong for that case.
   - `POST /api/v1/tasks/{id}/transitions` with `{"toStatus":"implement"}`. Requires `engineer` or `agent`.

7. **Stage: implementation work**
   - Status must be `implement` now. Do the full `/implement` work:
     - Create worktree at `.claude/worktrees/<task-display-id-lowercased>/` on `feat/<display-id-lowercased>-<3-5-word-slug>` off `origin/staging`. Reuse-or-fail rules from `/implement` apply (never silently overwrite).
     - Red-green TDD per global instructions.
     - Run `npm test` in every package touched. Don't bypass the pre-commit hook (`tsc --noEmit` / `vue-tsc --noEmit`).
     - Commit by file name (no `git add -A`), with the `Co-Authored-By` trailer.
     - `git push -u origin <branch>`.
   - Open the PR targeting `staging` with the standard body (Summary / Task link / Acceptance criteria checklist copied from the spec / Test plan).
   - Link the PR back to the task: `POST /api/v1/tasks/{id}/pull-requests` with `{ "number", "title", "state":"open", "url" }`. Do not also post a duplicate comment.

8. **Stage: `implement` → `validate`**
   - `POST /api/v1/tasks/{id}/transitions` with `{"toStatus":"validate"}`. Requires `engineer` or `agent`. The linked PR is the signal.

9. **Report**
   - Print:
     - Final status (should be `validate`).
     - Task URL: `https://taskflow.informup.org/tasks/feature/<task-id>`.
     - PR URL.
     - The exact transition trail you performed (e.g. `discuss → design → prototype → implement → validate`).
   - Do **not** run `/validate` afterward. Validation is intentionally a separate human/agent checkpoint — the whole point of landing in `validate` is that someone else (or a fresh `/validate` invocation) reviews the PR against the spec independently.

## Failure handling

- **403 on any transition**: stop. Print which transition failed and the team requirement. Leave the task wherever the last successful transition put it — do not roll back.
- **Pre-commit / type / test failures during implementation**: fix the underlying cause. Do not bypass with `--no-verify`. If you can't fix it within the run, stop, post a comment on the task summarizing where you got stuck, and leave the task in `implement` (the PR can stay unpushed or in draft).
- **Spec gaps discovered mid-implementation**: if the design spec turns out to be wrong or missing something material, stop the implementation, post a comment on the task explaining the gap, and leave the task in `implement`. Do not silently extend the spec — that defeats the validation contract.
- **Existing worktree on the target path**: same rule as `/implement` — inspect with `git worktree list`, reuse only if it's on the intended branch and clean, otherwise stop and ask.

## Notes

- **One PR, one task.** No splitting mid-run. If the task is too big, stop and tell the user to split it into separate tasks before fast-tracking.
- **Don't merge the PR.** Merge is always a human decision, fast-track or not.
- **Don't run `/validate` from within fast-track.** Validation is the human review point we're handing off to.
- **Worktree cleanup is not your job.** Leave the worktree in place after the run — the user removes it post-merge.
- **This skill is the wrong tool for**: tasks needing real design discussion, tasks needing a throwaway prototype, large tasks, or tasks where the token user lacks one of the four required team grants. Use the staged skills instead.
