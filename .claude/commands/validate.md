---
description: Validate a TaskFlow task in `validate` status — review the linked PR against acceptance criteria, leave review comments on GitHub
argument-hint: "<task-id-or-display-id>"
---

# Validate

Pick up a task in `validate` status, review its linked PR against the design spec's acceptance criteria, and leave a GitHub review. If the PR passes cleanly, offer to transition to `review`. If issues are found, request changes on the PR and leave the task in `validate` — another agent will address the comments.

## Arguments

- `$ARGUMENTS` — task ID (UUID) or display ID (e.g. `FEAT-2`). If omitted, ask.

## Instructions

1. **Setup**
   - Read API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`. Repo: `INFORMUP/TaskFlow`.

2. **Fetch task + comments + linked PR**
   - Resolve task by UUID or display ID (`FEAT`→`feature`, `BUG`→`bug`, `IMP`→`improvement`).
   - `GET /api/v1/tasks/{id}` and `GET /api/v1/tasks/{id}/comments`.
   - `GET /api/v1/tasks/{id}/pull-requests` — there should be at least one open PR. If zero, stop and tell the user the task isn't ready for validation. If multiple, ask which one.

3. **Verify status: `currentStatus.slug == "validate"`.** If not, stop.

4. **Establish the validation criteria**
   - Find the design spec in the task comments (the structured spec posted by `/design`). Extract the **Acceptance criteria** checklist — that is the ground truth.
   - If no design spec exists, fall back to the task description. If neither has concrete criteria, stop and post a comment on the task asking for them — do not invent criteria.

5. **Review the PR**
   - `gh pr view <number> --json title,body,state,baseRefName,headRefName`
   - `gh pr diff <number>` — read the full diff. Don't skim.
   - For each acceptance criterion: trace through the diff and note whether the change satisfies it. If a criterion needs a runtime check (UI behavior, integration), say so explicitly rather than asserting it works.
   - Also look for: missing tests for new behavior, security regressions, accidental changes outside scope, breaking changes to existing endpoints, schema changes without migrations.
   - **Don't try to run the code.** This skill reviews; running is a separate concern (and the worktree may not be set up for it).

6. **Decide the verdict**
   - **Clean** — every acceptance criterion is satisfied by the diff, tests cover the new behavior, no regressions spotted. Proceed to step 7a.
   - **Changes requested** — any criterion isn't met, tests are missing, or you spotted a real issue. Proceed to step 7b.
   - **Comment-only** — minor questions or suggestions but nothing blocking. Proceed to step 7c.

7. **Post the review on GitHub**

   **7a. Clean → APPROVE.**
   ```bash
   gh pr review <number> --approve --body "$(cat <<'EOF'
   ## Validation against acceptance criteria
   - [x] <criterion 1> — verified at <file:line>
   - [x] <criterion 2> — verified at <file:line>
   ...

   No blocking issues found.
   EOF
   )"
   ```

   **7b. Changes needed → REQUEST_CHANGES.**
   ```bash
   gh pr review <number> --request-changes --body "$(cat <<'EOF'
   ## Validation against acceptance criteria
   - [x] <criterion 1> — verified at <file:line>
   - [ ] <criterion 2> — **not satisfied**: <specific reason, with file:line if applicable>
   ...

   ## Other concerns
   - <issue 1, with file:line>
   - <issue 2>
   EOF
   )"
   ```
   Be specific. "Looks wrong" is useless; "src/foo.ts:42 — this branch is unreachable because `x` is always truthy here" is actionable.

   **7c. Comment-only → COMMENT.**
   ```bash
   gh pr review <number> --comment --body "..."
   ```

8. **Update the task**

   - **If approved (7a)**: ask the user whether to transition to `review`. If yes:
     - `POST /api/v1/tasks/{id}/transitions` with `{"toStatus":"review","note":"Validation passed — see PR review."}`.
     - `review` requires `engineer` or `product` team — surface 403 if the token user lacks both.
   - **If changes requested (7b)**: leave the task in `validate`. Post a short comment on the task: `Validation requested changes — see PR review: <pr-url>`. Don't transition.
   - **If comment-only (7c)**: same as 7a — offer the transition, since the comments are non-blocking.

## Notes

- **Don't merge or close the PR.** Reviews only.
- **Don't push commits to the PR branch.** Address-comments work belongs to the implementing agent or a fix-up agent.
- **Don't loop.** This skill is one-shot: review, post, stop. Re-validating after fixes is a fresh `/validate` invocation.
- **Be honest about what you can't verify.** If a criterion is "the dashboard groups tasks by status" and you can only see a `groupBy` call in the diff, say "diff shows the grouping logic; runtime behavior not verified." Do not approve criteria you couldn't actually check.
- **Acceptance criteria are the contract.** Don't hold the PR to criteria the spec didn't include — if you think the spec missed something important, raise it as a comment for follow-up, not a blocker on this PR.
