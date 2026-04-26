---
description: Transition a TaskFlow task to a different status (escape hatch — prefer status-specific skills like /design when they apply)
argument-hint: "<task-id-or-display-id> <to-status> [note]"
---

# Transition

Move a TaskFlow task to a target status. Thin wrapper around `POST /api/v1/tasks/{id}/transitions`.

Use this for:
- Backward moves (`design → discuss`, `prototype → design`)
- Closing transitions (with a resolution)
- One-offs that aren't covered by a status-specific skill

For forward moves through a normal workflow, prefer the status-specific skill (`/design`, `/prototype`, etc.) — those do the *work* for the new status, not just the move.

## Arguments

- `$ARGUMENTS` — `<task-id-or-display-id> <to-status> [note...]`
  - Task ID: a UUID or a display ID like `FEAT-2`, `BUG-1`, `IMP-3`. Prefix → flow: `FEAT`→`feature`, `BUG`→`bug`, `IMP`→`improvement`.
  - To-status: status slug (e.g. `design`, `prototype`, `closed`).
  - Note: optional. The server accepts transitions without a note. Ask the user when context genuinely matters (backward bounces, closing transitions); skip the prompt for routine forward moves.

## Instructions

1. **Setup**
   - Read API token from `~/.taskflow-import-token` (chmod 600). Never log it.
   - Base URL: `https://taskflow.informup.org`.

2. **Resolve task**
   - If the first arg is a UUID: `GET /api/v1/tasks/{id}`.
   - Otherwise treat it as a display ID. Derive the flow from the prefix and `GET /api/v1/tasks?flow=<slug>`, then match `displayId`. Stop with a clear error if no match.
   - Capture `flow.slug`, `currentStatus.slug`, and `id` for the next steps.

3. **Get note (when warranted)**
   - If the user supplied a note, use it.
   - If the move is a backward bounce (`design → discuss`, `prototype → design`, `implement → approve`, etc.) or a closing transition, prompt: "Note for this transition?" — context matters here.
   - For routine forward moves, omit the note — the server accepts transitions without one.

4. **Closing transition? Get resolution.**
   - If `to-status == "closed"`, a resolution is required.
   - Per-flow valid resolutions:
     - `bug`: `fixed`, `invalid`, `duplicate`, `wont_fix`, `cannot_reproduce`
     - `feature`: `completed`, `rejected`, `duplicate`, `deferred`
     - `improvement`: `completed`, `wont_fix`, `deferred`
   - Ask the user to pick one for the task's flow. Reject anything not in the list.

5. **POST the transition**
   - `POST /api/v1/tasks/{id}/transitions` with body:
     ```json
     { "toStatus": "<slug>", "note": "<note-if-any>", "resolution": "<resolution-if-closing>" }
     ```
   - Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`.

6. **Handle errors clearly**
   - **422 `TRANSITION_NOT_ALLOWED`**: the response body's `error.details.allowedTransitions` lists the legal targets from the current status. Print them and stop — do not retry with a guessed status.
   - **422 `INVALID_STATUS`**: the slug doesn't exist on this flow. Print the message; ask the user to re-check.
   - **422 `RESOLUTION_REQUIRED` / `INVALID_RESOLUTION`**: re-prompt for a valid resolution.
   - **Note**: the server no longer rejects empty notes — there is no `NOTE_REQUIRED` error to handle.
   - **403 `FORBIDDEN`**: the token user's team can't transition into this status. Surface the message and stop — fixing this means changing team membership or the permission matrix, not retrying.
   - **403 `INSUFFICIENT_SCOPE`**: the token lacks `transitions:write`. Tell the user to re-mint with that scope.

7. **Report**
   - On success: `Transitioned <displayId>: <fromStatus> → <toStatus>` and the task URL: `https://taskflow.informup.org/tasks/<flow-slug>/<task-id>`.

## Notes

- **One transition per invocation.** This skill is intentionally narrow.
- **Don't post a comment as a side effect.** If the user wants context preserved beyond the note, they can add a comment separately — keep this skill focused on the move.
- **Don't retry on validation errors.** The server's allowed-transitions list is the source of truth; surface it and let the user choose.
