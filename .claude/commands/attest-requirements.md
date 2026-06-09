---
description: Submit agent attestations on a task's requirements — review each agent-designated signoff slot, form a verdict, and optionally attach an evidence image
argument-hint: "<task-id-or-display-id>"
---

# Attest Requirements

Review a task's requirements and submit verdicts on any agent-designated signoff slots that are still open. For each slot, examine the available evidence (task description, design spec, linked PR diff, code) and submit `met` or `not_met` with an optional text explanation and/or evidence image.

## Arguments

- `$ARGUMENTS` — task ID (UUID) or display ID (e.g. `FEAT-2`). If omitted, ask.

## Instructions

1. **Setup**
   - Read API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`.
   - The API token must have `tasks:read` and `attestations:write` scopes. Any API token session (regardless of `actorType`) can attest agent slots — if a 403 `CHANNEL_MISMATCH` is returned, the session is an interactive JWT (not an API token) and cannot be used here.

2. **Fetch task + comments + requirements**
   - Resolve task by UUID or display ID (`FEAT`→`feature`, `BUG`→`bug`, `IMP`→`improvement`).
   - `GET /api/v1/tasks/{id}` — read the title, description, and current status.
   - `GET /api/v1/tasks/{id}/comments` — find the design spec posted by `/design` (if any). Extract the **Acceptance criteria** — these are the ground truth for every verdict.
   - `GET /api/v1/tasks/{id}/requirements` — returns requirements with slots, attestations, and quorum state. Note: the response includes `images` per requirement; fetch and inspect any attached reference images with `GET /api/v1/images/{imageId}`.

3. **Identify open agent slots**
   - For each requirement, find slots where:
     - `requiredActorType === "agent"` (or `null`, meaning unrestricted), AND
     - no attestation has been submitted yet (the `attestations` array is empty for that slot).
   - If there are no open agent slots, report the current quorum state for each requirement and stop — there is nothing to attest.
   - If some requirements are fully verified (`quorum.verified === true`) and others aren't, focus only on those with open slots.

4. **Review the evidence**
   - Read the task description and acceptance criteria carefully.
   - If a linked PR exists (`GET /api/v1/tasks/{id}/pull-requests`), run `gh pr diff <number>` and read the full diff. Trace each requirement's statement through the diff.
   - If the requirement has attached images, retrieve and inspect them — they may be mockups, diagrams, or specifications.
   - For each open slot, form a verdict:
     - `met` — the requirement is satisfied by the evidence you've reviewed.
     - `not_met` — the requirement is not satisfied; be specific about why.
   - Never guess. If you cannot determine whether a requirement is met from the available evidence, submit `not_met` with an explanation of what evidence is missing, rather than a false `met`.

5. **Optionally capture an evidence image**
   - If you have a screenshot or artifact that substantiates your verdict (e.g. a screenshot of a passing test run, a rendered diagram, a visual diff), upload it before submitting the attestation:
     ```
     POST /api/v1/tasks/{id}/requirements/{rid}/images
     Content-Type: multipart/form-data
     Body: file=<image binary>
     ```
   - The response returns `{ id, filename, mimeType, size, createdAt }`. Record the `id` to pass as `evidenceImageId`.
   - If you have no image evidence, omit it — it is optional.

6. **Submit attestations**
   - For each open agent slot, POST:
     ```
     POST /api/v1/tasks/{id}/requirements/{rid}/slots/{sid}/attestations
     Authorization: Bearer <token>
     Content-Type: application/json

     {
       "verdict": "met" | "not_met",
       "comment": "<concise explanation of why this verdict was reached>",
       "evidence": "<image UUID from step 5, if applicable>"
     }
     ```
   - `comment` is the text explanation (always include it). `evidence` is the image UUID — omit it if you have no image.
   - **Do not put text in `evidence`** — the UI treats `evidence` as an image ID and will show a broken camera icon if it contains a plain string.
   - Process slots one at a time. If any POST returns a non-201, stop and report the error before continuing.

7. **Report results**
   - After all attestations are submitted, `GET /api/v1/tasks/{id}/requirements` again to get the updated quorum state.
   - For each requirement, report:
     - Requirement number + statement
     - Each slot: label, your verdict, evidence summary
     - Quorum: `verified: true/false`, `signed/total`
   - If all requirements are now fully verified, note that and suggest transitioning the task forward if appropriate — but do not transition automatically.
   - If any requirement is still not verified (e.g. it has human slots still pending), call that out clearly.

## Notes

- **Resubmittable.** The API accepts multiple attestations per slot (each POST creates a new record). The latest attestation is what counts for quorum. You can correct a wrong verdict by resubmitting — include a brief note in `comment` explaining the correction. Still: think carefully before posting, since the full history is visible.
- **Don't fabricate evidence.** Only submit `met` if you can point to something concrete (a line of code, a passing test, a design match). "I assume it works" is not evidence.
- **Scope:** this skill attests agent slots only. Human slots require a human session and will be rejected by the server (`CHANNEL_MISMATCH`) — do not attempt them.
- **No task transitions.** This skill submits verdicts; moving the task forward is the human's decision.
