# Action Items — Conventions

This directory holds discrete admin action items: small requests, bug reports, polish items, or follow-ups that aren't large enough to warrant a build-plan phase.

## Status by location

- **Active** — file lives directly in `docs/action-items/`.
- **Done / abandoned** — file is moved to `docs/action-items/archive/`.

Status is determined by **file location**, not by content inside the file. Do not use status markers (`✅`, `[x]`, "DONE") in filenames or headings to indicate completion — move the file instead.

## File naming

`kebab-case-summary.md` — short, descriptive, no dates or status prefixes.

Good: `clickable-links-in-task-descriptions.md`, `project-default-assignee.md`
Bad: `2026-04-13-fix-links.md`, `DONE-project-assignee.md`, `task-1.md`

## File structure

```markdown
# {{Title}}

**Requested:** YYYY-MM-DD (and by whom, if relevant)
**Context:** one or two sentences on why this matters / where it came from.

## Ask

What needs to happen, in plain terms.

## Notes

Optional: design considerations, related files, blockers, decisions made while scoping.
```

Keep items small and singular. If an item grows multiple sub-tasks, either split it into separate files or promote it to a build-plan entry.

## Workflow

1. **Adding** — create the file in `docs/action-items/` and add a link under "Active" in `README.md`.
2. **Working on it** — edit in place. Add notes/decisions to the file as you go.
3. **Finishing** — move the file to `archive/`, move its README link from "Active" to the archive section (or just rely on `archive/` listing), and add a short **Resolution:** line at the top of the file noting what was done and the commit/PR if applicable.
4. **Abandoning** — same as finishing, but the resolution line explains why it was dropped.

Never delete an archived item; the historical record is the point.

## When NOT to put something here

- Multi-phase work with its own scope → `docs/build-plan/`.
- Reference material (terminology, API shape, permissions) → top-level `docs/*.md`.
- In-flight conversation context that won't outlive the session → don't write a file at all.
