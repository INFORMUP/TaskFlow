# Phase 3 — Collaboration Features

**Goal:** Richer interaction between participants — labels, mentions, task relationships, and user preferences.

## Backend

- **Database tables**:
  - `labels`
  - `task_labels` (junction)
  - `comment_mentions`
  - `transition_mentions`
  - `task_relationships`
  - `user_preferences`
- **API endpoints**:
  - Labels: CRUD, add/remove from tasks
  - Mentions: Parsed at write time on comment/transition creation. "Tasks where I was mentioned" query (UNION across both mention tables).
  - Task relationships: Create/delete links (parent_child, blocks, relates_to). Query related tasks.
  - User preferences: Get/update own preferences.
- **Mention parsing**: Extract `@username` from comment bodies and transition notes at write time. Validate mentioned user has view permission on the task. Store in appropriate mention table.
- **Full-text search**: PostgreSQL tsvector/GIN indexes on task title/description and transition notes. Wire up the `q` parameter on task list endpoint.

## Frontend

- **Labels**: Label picker on task creation/edit. Colored label chips on task cards. Filter by label.
- **Mentions**: `@username` autocomplete in comment and transition note inputs. Highlight mentions in rendered text.
- **Task relationships**: Link tasks from detail view. Show related/blocked/parent/child tasks.
- **User preferences page**: Notification settings, default filters.
- **Search**: Full-text search bar across tasks and transition notes.

## What this validates

- Do mentions drive useful engagement, or are they noise?
- Are task relationships sufficient for epic-like grouping, or is a formal epic model needed?
- Are the label and search features adequate for task discovery at current scale?
