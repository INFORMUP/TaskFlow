---
description: Address review comments on a TaskFlow task's linked PR — make the requested fixes, push, and reply to comments
argument-hint: "<task-id-or-display-id-or-pr-number>"
---

# Address Review

Pick up a PR with requested changes, address each comment with a code fix or a reasoned reply, push the fixes, and re-request review. Inverse of `/validate`.

## Arguments

- `$ARGUMENTS` — one of:
  - Task display ID (`FEAT-1`) or UUID — the PR is resolved via `GET /api/v1/tasks/{id}/pull-requests`.
  - Bare PR number (`#42` or `42`) — useful when there's no TaskFlow task or you already know the PR.

  If omitted, ask.

## Instructions

1. **Setup**
   - Read API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`.
   - GitHub repo (`<owner>/<repo>` in the examples below): derive from the task's linked code repo if set; otherwise use the current checkout's `origin` (`git remote get-url origin`). Do not assume `<owner>/<repo>`.

2. **Resolve the PR**
   - If the arg looks like a PR number: use it directly.
   - Otherwise resolve task → PR via `GET /api/v1/tasks/{id}/pull-requests`. If zero linked PRs, stop. If multiple, ask which one.
   - Capture the PR number, head branch, and base branch.

3. **Verify the PR has requested changes**
   - `gh pr view <number> --json reviews,state,mergeable,headRefName,baseRefName`
   - If state is `MERGED` or `CLOSED`, stop.
   - If no review with `state == "CHANGES_REQUESTED"` exists, ask the user whether they want to address general comments anyway. Don't assume.

4. **Pull every reviewer comment**
   - Top-level review summaries: included in `gh pr view <number> --json reviews`.
   - Inline diff comments: `gh api repos/<owner>/<repo>/pulls/<number>/comments` (REST). These have `path`, `line`, `body`, and `id`.
   - PR-level conversation comments: `gh api repos/<owner>/<repo>/issues/<number>/comments`.
   - Build a single ordered list of every comment, with: source (review summary / inline / conversation), file+line if any, author, and body. Don't lose any.

5. **Check out the PR's head branch**
   - If you're not already on the PR's head branch, `git fetch origin <head-branch>` and `git checkout <head-branch>`. If the working tree is dirty, stop and ask the user.
   - You may be in a worktree set up by `/implement` — if its branch matches the PR head, use it; otherwise create a worktree from the head branch:
     ```bash
     git fetch origin <head-branch>
     git worktree add .claude/worktrees/<task-or-pr-id>-fix origin/<head-branch>
     ```
   - If the worktree path already exists (e.g. a prior address-review pass), `git worktree list` to inspect it. If it's on the same head branch and clean, reuse it. Otherwise ask the user whether to remove it (`git worktree remove`) or pick a new suffix (`-fix2`, etc.). Never silently overwrite.

6. **Triage each comment**
   For every comment, decide one of:
   - **Fix**: code change required.
   - **Reply-only**: reviewer is wrong, or it's a question with a code-grounded answer, or it's already done. No code change.
   - **Defer**: legitimate but out of scope for this PR. Will become a follow-up task.

   Write the triage decision down (in conversation, not in a file) before touching code. If you can't decide, ask the user — don't guess.

7. **Make the fixes (TDD)**
   - For each `Fix` comment: write a failing test first if applicable, then the minimum change. Refactor if needed.
   - Stay scoped to what reviewers asked for. Resist drive-by cleanups.
   - Run the project's test command in any package you touched (e.g. `npm test`, `pytest`, `cargo test`).

8. **Pre-commit checks**
   - Run whatever pre-commit / typecheck hooks the repo configures (e.g. `tsc --noEmit`, `vue-tsc --noEmit`, `ruff`, `mypy`). Fix errors; do not bypass with `--no-verify`.

9. **Commit + push**
   - One commit per logical fix, or one squash commit if the changes are tightly related. Don't bundle unrelated fixes.
   - Commit messages reference the review concisely: `fix(scope): <what changed> (review)`.
   - End every commit with the `Co-Authored-By` trailer.
   - `git push origin <head-branch>`.

10. **Reply to each comment**
    - **Inline diff comments**: reply via `gh api -X POST repos/<owner>/<repo>/pulls/<number>/comments/<comment-id>/replies -f body="..."`. (GitHub also accepts POSTing to the parent `/comments` collection with `-F in_reply_to=<comment-id>`; either works, but the `/replies` sub-resource is the documented path.)
    - **Review summary comments**: there's no per-summary reply API — post a single PR-level conversation comment summarizing what was addressed:
      ```bash
      gh pr comment <number> --body "$(cat <<'EOF'
      Addressed review:
      - <comment 1 summary> → fixed in <commit-sha>
      - <comment 2 summary> → fixed in <commit-sha>
      - <comment 3 summary> → not changed: <reason>
      - <comment 4 summary> → deferred to follow-up task: <task-url>
      EOF
      )"
      ```
    - **Conversation comments**: reply with `gh pr comment <number> --body "..."` (threaded replies aren't supported by the issue-comment API).
    - **Reply-only / Defer**: still post a short reply explaining the reasoning. Silence reads as ignoring the reviewer.

11. **Re-request review**
    - `gh pr view <number> --json reviewRequests,reviews -q '.reviews[].author.login'` to find prior reviewers.
    - `gh api -X POST repos/<owner>/<repo>/pulls/<number>/requested_reviewers -f reviewers='["<login>"]'` for each prior reviewer.

12. **Update the task**
    - If task was resolved in step 2: do **not** transition it. The task should already be in `validate` — leave it there for the reviewer to re-validate. Post a brief task comment: `Addressed review on <pr-url> — ready for re-validation.`
    - If any comments were `Defer`d: open a follow-up task via `/create-task` (or instruct the user to). **Pass `spawnedFromTaskId` set to the source task's UUID** so the provenance link from the follow-up back to this task is recorded — the follow-up's detail page will then show "Spawned from <DISPLAY-ID>" and this task's detail page will list it under "Follow-ups". Link the new task in the PR comment from step 10.

## Notes

- **Don't argue in PR replies.** If you disagree with a reviewer, state the trade-off and your decision in one short paragraph and move on. The PR isn't the place for an essay.
- **Don't push without addressing every comment.** A partial address looks worse than not starting — reviewers will assume the rest was missed, not deferred.
- **Don't merge the PR.** Re-validation belongs to the reviewer (or `/validate` re-run).
- **Don't force-push** unless the user explicitly asked. Adding commits is fine; rewriting history loses reviewer context (their old inline comments detach from lines).
- **Defer is real.** Some review comments are legitimate but expand the scope past what this PR should do. Open a follow-up task and say so in the reply.
