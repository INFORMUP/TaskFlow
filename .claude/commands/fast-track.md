---
description: Fast-track a TaskFlow engineering task (feature/bug/improvement) from its current status all the way to `validate` in one go — scoping artifact, implementation, PR, transitions
argument-hint: "<task-id-or-display-id>"
---

# Fast-track

Take an engineering-flow task (`feature`, `bug`, or `improvement`) from wherever it currently sits and drive it to **`validate`** in a single invocation. This composes the flow's scoping work (`/design` or its per-flow equivalent) + `/implement` + the intervening transitions. Use it when you already have enough context to scope and implement back-to-back without waiting for human review at each gate.

This skill is a deliberate shortcut around the per-stage human review points the individual skills preserve. Only use it when:
- The task is small/well-understood enough that a single agent can sensibly carry it end-to-end.
- You (the token user) hold the team memberships needed for **every** transition involved (preflighted in step 3 — see "Permission map").
- The user has explicitly asked for a fast-track, not a careful staged walk.

If any of those don't hold, stop and use `/design`, `/implement`, `/transition` individually instead.

## Arguments

- `$ARGUMENTS` — task ID (UUID) or display ID (`FEAT-2`, `BUG-7`, `IMP-3`). If omitted, ask.

## Supported flows

Fast-track is for **engineering flows only** — the ones that culminate in a code change and a PR:

| Flow | Display prefix | Stages | Scoping artifact | Gate(s) auto-crossed | Code stage | Branch prefix |
|---|---|---|---|---|---|---|
| `feature` | `FEAT` | discuss → design → prototype → implement → validate → staging → closed | **Design spec** | discuss, design, prototype | `implement` | `feat/` |
| `bug` | `BUG` | triage → investigate → approve → resolve → validate → staging → closed | **Investigation** | triage, investigate, approve | `resolve` | `fix/` |
| `improvement` | `IMP` | propose → approve → implement → validate → closed | **Proposal** | propose, approve | `implement` | `feat/` |

All three target **`validate`**. Fast-track picks the task up at its current status and only runs the stages from there forward. From `validate` or later, stop — there is nothing left to fast-track.

**Non-engineering flows are not supported.** `grant-application`, `donor-outreach`, and `event` are human/ops workflows: their stages (`submitted`, `host`, `committed`, …) are real-world actions an agent can't perform, and the permission matrix grants only `product` transition rights on them (agents get view/comment). If the task is on one of these flows, **stop immediately** and tell the user fast-track doesn't apply — point them at `/walk` or `/transition` for manual, human-driven progression.

## Permission map (preflighted)

The token user must be on a team allowed for *every* transition the run will perform. The TaskFlow server is the source of truth (`permission.service.ts` → `TRANSITION_PERMISSIONS`). Today, for the path each flow takes to `validate`:

- `feature`: `discuss`→`product`/`user`, `design`→`product`, `prototype`→`engineer`/`agent`, `implement`→`engineer`/`agent`, `validate`→`engineer`/`agent`
- `bug`: `triage`→`engineer`/`product`/`agent`, `investigate`→`engineer`/`agent`, `approve`→`engineer`/`agent`, **`resolve`→`engineer` only**, `validate`→`engineer`/`agent`
- `improvement`: `propose`→`engineer`/`agent`, **`approve`→`engineer` only**, `implement`→`engineer`/`agent`, `validate`→`engineer`/`agent`

Note the **engineer-only** gates: `bug.resolve` and `improvement.approve`. An `agent`-only token cannot fast-track a bug or improvement past those. This is exactly why the run preflights the whole chain (step 3) instead of discovering a 403 mid-implementation.

## Instructions

1. **Setup**
   - Read API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`.
   - GitHub repo: derive from the task's linked code repo if set; otherwise use the current checkout's `origin` (`git remote get-url origin`). Do not assume `INFORMUP/TaskFlow`.

2. **Resolve task + flow gate**
   - Resolve UUID or display ID via prefix: `FEAT`→`feature`, `BUG`→`bug`, `IMP`→`improvement`.
   - If the task is on a non-engineering flow (`grant-application`/`donor-outreach`/`event`), **stop** per "Supported flows" above.
   - `GET /api/v1/tasks/{id}` and `GET /api/v1/tasks/{id}/comments`.
   - Note `currentStatus.slug`. If it's at `validate` or later, stop — nothing to fast-track.

3. **Preflight the whole transition chain (before any mutation)**
   - From the current status, compute the ordered list of `toStatus` transitions the run will perform, ending at `validate` (per the flow's row in "Supported flows").
   - Determine the token user's team memberships. For **every** transition in the chain, check the required teams against `TRANSITION_PERMISSIONS` for this flow. If *any* transition would be denied, **stop now** and surface the complete picture in one message: which transition(s) fail, the team(s) required, and the current status. Do not start work that a later transition can't complete (the `bug.resolve` / `improvement.approve` engineer-only gates are the common trap).
   - This is a dry check — do not POST anything yet.

4. **Confirm with the user (conditionally)**
   - Print: starting status, target status (`validate`), the ordered transition trail, and the scoping/code work the run will do.
   - **Skip the confirmation prompt if the task description already reads as a complete scoping pass** — i.e. it carries this flow's artifact content (see "Per-flow adequacy bars"). In that case the description itself is the human checkpoint; just print the plan and start.
   - Otherwise (thin/ambiguous description), ask for explicit confirmation before doing anything mutating. This is the human checkpoint the skill falls back to when the description doesn't carry its own.

5. **Cross the scoping/gate stages (auto-cross-if-artifact-present)**
   - Run only for stages at or after the current status, up to (not including) the code stage.
   - **Generate the flow's scoping artifact** if it isn't already present in the task, and post it as a comment (`POST /api/v1/tasks/{id}/comments`). This mirrors how `/design` produces a feature design spec — synthesize it from the task + comments + relevant code. **Do not skimp**: the artifact's acceptance/done criteria become the contract for implementation and validation.
     - `feature` → **Design spec**: Goal / User stories / Acceptance criteria / Technical approach / Out of scope / Open questions.
     - `bug` → **Investigation**: Reproduction (confirmed steps) / Root cause / Regression-test plan (what the failing-first test will assert) / Fix approach / Out of scope.
     - `improvement` → **Proposal**: Rationale (why now) / Approach / Done criteria (how it's validated) / Out of scope.
   - **Adequacy gate (the query mechanism).** Measure the artifact against the flow's bar below.
     - If it **meets the bar**, treat it as the human checkpoint and cross each gate stage silently: `POST /api/v1/tasks/{id}/transitions` with the next `{"toStatus": …}`. No filler notes — the posted artifact is the signal. This includes crossing dedicated approval gates (`bug.approve`, `improvement.approve`, feature `discuss`).
     - If it **falls short**, **stop and surface a query**. Leave the task where it is and tell the user what's missing. Do not paper over gaps to keep moving.
   - **Hard stop regardless of bar:**
     - `feature`/`improvement`: if the artifact has material **Open questions** that block implementation → stop, leave in place, report.
     - `bug`: if the bug is **not reproducible** or the **root cause is unknown** → stop. You cannot regression-TDD a fix you can't reproduce; this is the single most important guard for the bug flow.

6. **Code stage (worktree + TDD + PR)**
   - Status must now be the flow's code stage (`implement` for feature/improvement, `resolve` for bug). Do the full `/implement` work:
     - Create worktree at `.claude/worktrees/<task-display-id-lowercased>/` on `<branch-prefix>/<display-id-lowercased>-<3-5-word-slug>` off `origin/staging` (branch prefix per the flow table). Reuse-or-fail rules from `/implement` apply (never silently overwrite).
     - Red-green TDD per global instructions. For `bug`, this is **regression** TDD — write the failing-first test that reproduces the bug, per the investigation's regression-test plan.
     - Run `npm test` in every package touched. Don't bypass the pre-commit hook (`tsc --noEmit` / `vue-tsc --noEmit`).
     - Commit by file name (no `git add -A`), with the `Co-Authored-By` trailer.
     - `git push -u origin <branch>`.
   - Open the PR targeting `staging` with the standard body (Summary / Task link / Acceptance-or-done criteria checklist copied from the artifact / Test plan).
   - Link the PR back to the task: `POST /api/v1/tasks/{id}/pull-requests` with `{ "number", "title", "state":"open", "url" }`. Do not also post a duplicate comment.

7. **Transition into `validate`**
   - `POST /api/v1/tasks/{id}/transitions` with `{"toStatus":"validate"}`. The linked PR is the signal. (Already preflighted in step 3.)

8. **Report**
   - Print:
     - Final status (should be `validate`).
     - Task URL: `https://taskflow.informup.org/tasks/<flow-slug>/<task-id>`.
     - PR URL.
     - The exact transition trail you performed (e.g. `investigate → approve → resolve → validate`).
   - Do **not** run `/validate` afterward. Validation is intentionally a separate human/agent checkpoint — the whole point of landing in `validate` is that someone else (or a fresh `/validate` invocation) reviews the PR against the artifact independently.

## Per-flow adequacy bars (the query triggers)

These define when step 5 auto-crosses vs. surfaces a query. A precise, complete artifact crosses silently; a thin one stops and asks.

- **feature** — Problem/Context + Proposal/Approach + Acceptance criteria present (ideally Out-of-scope too) → proceed. Missing acceptance criteria or only a one-line description → query.
- **bug** — Confirmed reproduction + identified root cause + a clear regression-test assertion → proceed. Not reproducible, unknown root cause, or no testable assertion → **stop** (hard guard, not just a query).
- **improvement** — Concrete rationale + a specific approach + how it'll be validated (done criteria) → proceed. "Just refactor X" with no approach or success criteria → query.

## Failure handling

- **Preflight permission gap (step 3)**: stop before any mutation. Print which transition(s) fail and the team requirement. Nothing has changed, so there's nothing to roll back.
- **403 on a transition mid-run** (shouldn't happen after preflight, but if perms changed underneath you): stop. Print which transition failed and the requirement. Leave the task wherever the last successful transition put it — do not roll back.
- **Pre-commit / type / test failures during the code stage**: fix the underlying cause. Do not bypass with `--no-verify`. If you can't fix it within the run, stop, post a comment on the task summarizing where you got stuck, and leave the task in the code stage (the PR can stay unpushed or in draft).
- **Artifact gaps discovered mid-implementation**: if the scoping artifact turns out to be wrong or missing something material, stop the implementation, post a comment explaining the gap, and leave the task in the code stage. Do not silently extend the artifact — that defeats the validation contract.
- **Existing worktree on the target path**: same rule as `/implement` — inspect with `git worktree list`, reuse only if it's on the intended branch and clean, otherwise stop and ask.

## Notes

- **One PR, one task.** No splitting mid-run. If the task is too big, stop and tell the user to split it into separate tasks before fast-tracking.
- **Don't merge the PR.** Merge is always a human decision, fast-track or not.
- **Don't run `/validate` from within fast-track.** Validation is the human review point we're handing off to.
- **Worktree cleanup is not your job.** Leave the worktree in place after the run — the user removes it post-merge.
- **This skill is the wrong tool for**: non-engineering flows, tasks needing real design discussion, tasks needing a throwaway prototype, large tasks, or tasks where the token user lacks one of the required team grants. Use the staged skills instead.
