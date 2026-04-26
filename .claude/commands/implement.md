---
description: Implement a TaskFlow task in `implement` status — creates a branch, makes the change, opens a PR into staging
argument-hint: "<task-id-or-display-id>"
---

# Implement

Pick up a task in `implement` status, do the work, and open a PR into `staging`. Assumes the task already has a design spec in its comments (from `/design`) and has been moved through `prototype` → `implement` by the appropriate teams.

## Arguments

- `$ARGUMENTS` — task ID (UUID) or display ID (e.g. `FEAT-2`). If omitted, ask.

## Instructions

1. **Setup**
   - Read API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`. Repo: `INFORMUP/TaskFlow`.

2. **Fetch task + comments**
   - Resolve task by UUID or display ID (`FEAT`→`feature`, `BUG`→`bug`, `IMP`→`improvement`).
   - `GET /api/v1/tasks/{id}` and `GET /api/v1/tasks/{id}/comments`.
   - **Verify status: `currentStatus.slug == "implement"`.** If not, stop and tell the user. This skill does not transition tasks into implement on its own — the prototype → implement move belongs to whoever owns prototype work.

3. **Read everything before touching code**
   - Read the task description in full.
   - Read every comment, especially any spec posted by `/design`. The spec's **Acceptance criteria** is what you'll verify against; the **Technical approach** is your starting point (not gospel — flag deviations explicitly).
   - Read the referenced files in the worktree to ground yourself. If the spec references files that don't exist or have moved, surface the discrepancy in a task comment and ask the user how to proceed before writing code.

4. **Create a worktree + branch**
   - Branch name: `feat/<task-display-id-lowercased>-<3-5-word-slug>` (e.g. `feat/feat-1-my-work-dashboard`). Use `fix/` prefix if the task is on the `bug` flow; `chore/` for `improvement` flow when the change is pure cleanup.
   - Worktree path: `.claude/worktrees/<task-display-id-lowercased>/` from the repo root.
   - Base off `origin/staging` (PRs target staging). Fetch first:
     ```bash
     git fetch origin staging
     git worktree add -b <branch> .claude/worktrees/<task-id-lower> origin/staging
     ```
   - If the path already exists (prior abandoned attempt, retry, etc.), `git worktree list` to inspect it. If it's on the intended branch and clean, reuse it and skip the `worktree add`. Otherwise stop and ask the user whether to `git worktree remove` it or pick a new suffix (`-v2`, etc.). Never silently overwrite an existing worktree.
   - `cd` into the new worktree for the rest of the work.

5. **Implement**
   - Follow red-green TDD per global instructions: failing test first, minimum impl, refactor.
   - Stay scoped to the task's acceptance criteria. Resist the urge to clean up adjacent code — open a separate task for that if it bothers you.
   - Run the affected package's tests as you go (`npm test` in `backend/` or `frontend/`).

6. **Pre-commit check**
   - Per CLAUDE.md, the pre-commit hook runs `tsc --noEmit` (backend) and `vue-tsc --noEmit` (frontend) — fix type errors, do not bypass with `--no-verify`.
   - Confirm `npm test` passes in every package you touched.

7. **Commit + push**
   - Stage files by name (never `git add -A`). One or a few focused commits.
   - Commit message style matches the repo (look at `git log --oneline -10`). End every commit with the `Co-Authored-By` trailer.
   - `git push -u origin <branch>`.

8. **Open the PR**
   - Target `staging`. Title under 70 chars, **must follow Conventional Commits** (the `lint-pr-title` workflow blocks merges otherwise). Format:
     ```
     <type>(<scope>): <short summary> (<displayId>)
     ```
     - Allowed `<type>`: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`, `style`. Pick `feat` for the `feature` flow, `fix` for `bug`, `chore`/`refactor` for `improvement` (match the change, not just the flow).
     - `<scope>` is optional but recommended (e.g. `frontend`, `backend`, `api`, `auth`). Lowercase, `[a-z0-9._/-]`.
     - Append `!` after the scope for breaking changes (`feat(api)!: ...`).
     - Example: `feat(frontend): replace /flows landing with My Work dashboard (FEAT-1)`.
   - Do NOT use the legacy `<displayId>: <summary>` form — it fails `lint-pr-title`.
   - Body (HEREDOC):
     ```markdown
     ## Summary
     <1-3 bullets of what changed>

     ## Task
     https://taskflow.informup.org/tasks/<flow-slug>/<task-id>

     ## Acceptance criteria
     <copy the checklist from the design spec, mark items done>

     ## Test plan
     - [ ] <the actual things a reviewer should verify>
     ```
   - `gh pr create --base staging --title "..." --body "$(cat <<'EOF' ... EOF)"`.

9. **Link the PR back to the task**
   - Use the structured endpoint: `POST /api/v1/tasks/{id}/pull-requests` with body:
     ```json
     {
       "number": <pr-number>,
       "title": "<pr-title>",
       "state": "open",
       "url": "<pr-url>"
     }
     ```
   - Requires `tasks:write` scope. The link surfaces in the task UI's code-links section, not as free-text in comments.
   - Do **not** also post a duplicate comment with the PR URL — the structured link is the canonical record.

10. **Offer transition**
    - Ask the user whether to transition the task to `validate` (next status after `implement` in the `feature` flow). If yes:
      - `POST /api/v1/tasks/{id}/transitions` with `{"toStatus":"validate","note":"PR opened — moving to validate. <pr-url>"}`.
    - If they decline, leave the task in `implement` (e.g. PR still in draft, or wants reviewer to advance it).

## Notes

- **Do not merge the PR.** Merging is a human decision after review.
- **Do not skip hooks.** If the pre-commit hook fails, fix the cause.
- **Do not push to `staging` or `main` directly.** Always go through a PR.
- **Worktree cleanup is not your job.** Leave the worktree in place — the user will remove it after the PR merges.
- **If you discover the task is too large mid-implementation**, stop, post a comment on the task explaining what you found, and ask the user whether to split it. Do not silently ship a partial implementation.
