# Build Plan — Agent Instructions

When a phase or sub-phase is finished, it must be marked complete in two places:

1. **Inside the phase doc** — add a `**Status:** ✅ Shipped YYYY-MM-DD.` line immediately after the top-level `# Phase N ...` heading. Use `✅ Complete` for top-level phases made up of shipped sub-phases.
2. **In `README.md`** — append ` ✅ Shipped` (sub-phases) or ` ✅ Complete` (top-level phases) to the bullet in the phase list.

Match the existing style: look at phase-1-mvp and its sub-phases as the reference.

Do not mark a phase complete until its tests pass and the work is landed on `main` (or the user has explicitly confirmed it's shipped).
