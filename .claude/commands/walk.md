---
description: Walk a TaskFlow task stage-by-stage from its current status, doing the work for each stage and prompting the user before every transition
argument-hint: "<task-id-or-display-id>"
---

# Walk

Drive a TaskFlow task forward from wherever it currently sits, one stage at a time. For each stage: do the work appropriate to that stage, then **stop and ask the user** whether to transition to the next stage. Repeat until the user stops the walk or the task reaches a terminal status (`closed`).

This is the careful counterpart to `/fast-track`. Fast-track skips the per-stage human checkpoints; `/walk` preserves them — every transition needs an explicit "yes" from the user. Use it when:
- The task isn't on the `feature` flow (fast-track is feature-only).
- You want to pick up a task wherever it is, regardless of flow.
- You want a guided walk-through with checkpoints, not a one-shot drive.

## Arguments

- `$ARGUMENTS` — task ID (UUID) or display ID (e.g. `FEAT-2`, `BUG-1`, `IMP-3`). If omitted, ask.

## Instructions

1. **Setup**
   - Read API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`.
   - GitHub repo: derive from the task's linked code repo if set; otherwise use the current checkout's `origin`.

2. **Resolve task**
   - UUID → `GET /api/v1/tasks/{id}`. Display ID → derive flow from prefix (`FEAT`→`feature`, `BUG`→`bug`, `IMP`→`improvement`; otherwise list flows and match), then `GET /api/v1/tasks?flow=<slug>` and match `displayId`.
   - Also `GET /api/v1/tasks/{id}/comments`.
   - Capture `flow.slug`, `currentStatus.slug`, `id`, `displayId`.

3. **Print the plan**
   - Print: task display ID + title, flow, current status, and the forward stages remaining (read from the flow's transitions if needed — `GET /api/v1/flows/<slug>` or infer from CLAUDE.md). Don't pretend to know stages you don't.
   - Tell the user: "I'll do the work for the current stage, then stop and ask before each transition. Reply `stop` at any prompt to end the walk."

4. **Stage loop** — repeat until the user stops or the task is `closed`:

   a. **Do the stage's work.** Dispatch by `(flow, status)`:

      - **`feature` flow**
        - `discuss` — read description + comments, summarize the open scoping questions, and ask the user to answer them inline. Post a comment capturing the resolved scope. Do **not** auto-write a design spec here; that's the next stage.
        - `design` — do the full `/design` work: read task + comments + relevant code, post a single comment with the spec (Goal / User stories / Acceptance criteria / Technical approach / Out of scope / Open questions). Stop the walk if material open questions remain.
        - `prototype` — by default this skill treats the design spec as sufficient and does no extra work here, same as fast-track. If the user wants a real spike, they'll say so at the prompt — leave the task in `prototype` and stop the walk so they can do it manually.
        - `implement` — do the full `/implement` work: worktree at `.claude/worktrees/<display-id-lower>/`, branch `feat/<display-id-lower>-<slug>` off `origin/staging`, red-green TDD, `npm test` in touched packages, no `--no-verify`, commit by file, push, open PR into `staging`, link via `POST /api/v1/tasks/{id}/pull-requests`.
        - `validate` — do the full `/validate` work: review the linked PR against the design spec's acceptance criteria, post an APPROVE / REQUEST_CHANGES / COMMENT review on GitHub with a criterion-by-criterion checklist. If the review is REQUEST_CHANGES, stop the walk — the next move is `/address-review`, not a forward transition.
        - `review` — human merge gate. Print the PR URL and stop the walk; merge is never an agent action.

      - **`bug` flow**
        - `triage` — read description, classify (severity, repro steps present?), and post a triage comment. Ask the user whether the bug is real / actionable before offering the move to `investigate`.
        - `investigate` — do the investigation: reproduce locally if possible, identify root cause, post a comment summarizing findings + proposed fix. If you can't repro, say so explicitly and stop — moving to `approve` without a known cause is wrong.
        - `approve` — human gate (product/eng decides whether to fix). Print the investigation summary and stop the walk so a human can approve.
        - `resolve` — same as feature `implement` but with `fix/` branch prefix. Open PR, link to task.
        - `validate` — same as feature `validate`.
        - `closed` — terminal. Stop.

      - **`improvement` flow**
        - `propose` — read description, post a brief comment with the proposed change and rationale. Ask the user whether to advance to `approve`.
        - `approve` — human gate. Stop.
        - `implement` — same as feature `implement` (use `chore/` branch prefix if pure cleanup, else `feat/`).
        - `validate` — same as feature `validate`.

      - **Other flows** (`grant-application`, `donor-outreach`, `event`, or anything new the seeder adds) — these are not engineering flows and `/walk` does not have stage-specific automation for them. Print: "Flow `<slug>` doesn't have automated stage handlers in /walk. Tell me what work this stage needs and I'll do it as a one-off, then we'll resume the walk." Then proceed conversationally.

      - **Already-`closed`** — nothing to do. Print the task URL and exit.

   b. **Refetch status.** After the stage's work, `GET /api/v1/tasks/{id}` again — earlier work (especially `/validate` REQUEST_CHANGES, or a sub-step that already transitioned) may have moved the task or made the next move wrong.

   c. **Pick the next status.** Use `GET /api/v1/flows/<slug>` (or the response's `allowedTransitions` from a 422 if you have one cached) to find legal forward targets from the current status. Skip backward bounces and `closed` unless the user explicitly asks for them. If exactly one forward target exists, propose it. If multiple (e.g. closing transitions are always available alongside the forward one), propose the natural-forward one and mention the alternatives.

   d. **Prompt the user.** Print:
      - What was just done in this stage (one or two lines).
      - Current status, proposed next status, and the team requirement (e.g. "requires `engineer` or `agent`").
      - Any blocker the stage's work surfaced (open questions, REQUEST_CHANGES review, missing repro).
      - Ask: "Transition to `<next>`? (y/N, or `stop` to end the walk, or name a different status to jump to)".

   e. **Act on the answer.**
      - `y` / `yes` → `POST /api/v1/tasks/{id}/transitions` with `{"toStatus": "<next>"}`. Include a `note` only for backward bounces or closing moves; routine forward moves don't need one. For `closed`, prompt the user for a `resolution` from the flow's valid set (see `/transition` for the list) and include it.
      - `n` / `no` / no answer → stop the walk, leave the task where it is, print the task URL.
      - `stop` → same as no.
      - A different status name → treat as a one-off transition (same as `/transition`); after it lands, continue the walk loop from the new status.

   f. **Continue.** Loop back to step 4a unless stopped or `closed`.

5. **Final report**
   - Print:
     - Final status.
     - Task URL: `https://taskflow.informup.org/tasks/<flow-slug>/<task-id>`.
     - PR URL if one was opened during the walk.
     - The transition trail performed (e.g. `design → prototype → implement`).

## Failure handling

- **403 on a transition** — stop the walk. Print which transition failed and the team requirement. Don't roll back; leave the task at the last successful state.
- **422 `TRANSITION_NOT_ALLOWED`** — print the `allowedTransitions` from the response and let the user pick (treat their pick as the "different status" branch in 4e). Don't guess.
- **Pre-commit / type / test failures during implementation** — fix the underlying cause. No `--no-verify`. If you can't fix it inside the run, stop the walk and post a comment summarizing where you got stuck.
- **REQUEST_CHANGES review during validate** — stop the walk. The next correct move is `/address-review`, not a forward transition.
- **Existing worktree on the target path during implement** — same rule as `/implement`: inspect with `git worktree list`, reuse only if on the intended branch and clean, otherwise stop and ask.

## Notes

- **Every transition requires user confirmation.** That is the whole point of this skill versus `/fast-track`. Never chain two transitions without an intervening prompt.
- **One PR, one task.** No splitting mid-walk.
- **Don't merge PRs.** Merge is always a human decision.
- **Don't run `/validate` recursively after a forward move into `validate`.** The walk's own `validate` stage handler is the validation; doing it again is duplicate review.
- **Worktree cleanup is not your job.** Leave it in place — the user removes it post-merge.
- **If the user wants to skip a stage's work** (e.g. "just transition, don't do design work here"), honor it — treat that turn as a pure `/transition` and continue the walk from the new status.
