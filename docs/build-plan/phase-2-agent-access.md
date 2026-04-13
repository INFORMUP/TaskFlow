# Phase 2 — Agent Access and Programmatic Use

**Goal:** Agents and scripts can interact with TaskFlow via scoped API tokens. The system supports both human and automated actors.

## Backend

- **Database tables**:
  - `api_tokens` (token_hash, token_name, expires_at)
  - `scopes` (seeded lookup table)
  - `api_token_scopes` (junction)
- **API endpoints**:
  - `POST /api/v1/auth/tokens` (create scoped token)
  - `DELETE /api/v1/auth/tokens/{token_id}` (revoke)
  - `GET /api/v1/auth/tokens` (list authenticated user's tokens)
- **Auth middleware update**: Accept Bearer tokens that are API tokens (not just JWTs). Resolve user, check token scopes intersected with team permissions.
- **Rate limiting**: 100/min user, 300/min agent, 60/min integration, response headers.
- **Agent user seeding**: Create agent user records that can be assigned tasks and appear in audit trails.

## Frontend

- **Token management UI**: Create, view, revoke API tokens. Scope selection from seeded list. Show plaintext once on creation.
- **Agent actor display**: Transition history and comments show agent actors distinctly from humans (icon/badge).

## Claude Code Skill

- Basic skill for terminal interaction: `taskflow status`, `taskflow list`, `taskflow transition <id> <status>`, `taskflow create bug|feature|improvement`.
- Authenticates via API token stored in user config.

## What this validates

- Can agents meaningfully participate in task workflows?
- Is the scope model granular enough without being burdensome?
- Does the Claude Code skill feel natural for engineer workflows?
