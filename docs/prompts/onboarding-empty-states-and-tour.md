# Onboarding: enriched empty states and guided tour

**Goal:** New users land on the task board with no explanation of TaskFlow's domain concepts (flows, status columns, transitions, teams). Add two lightweight onboarding features: (1) contextual empty-state content in board columns, and (2) a first-login guided tour that spotlights key UI elements.

## Part 1 — Enriched empty states

Replace the bare "No tasks" text (`TaskColumn.vue:28`) with flow- and status-aware help copy.

### New files

- **`frontend/src/data/emptyStateContent.ts`** — Static lookup map: `{ [flowSlug]: { [statusSlug]: { heading: string; description: string } } }` plus a generic fallback. Examples:
  - `bug/triage`: "New bug reports land here for initial assessment."
  - `feature/discuss`: "Feature ideas start here. Create a task to kick off discussion."
  - `improvement/propose`: "Propose an improvement — describe the problem and your suggested fix."
  - Generic fallback: "No tasks in this stage yet. They'll appear here as work progresses."

- **`frontend/src/features/tasks/components/TaskColumnEmptyState.vue`** — Props: `flowSlug: string`, `statusSlug: string`. Looks up the content map, renders a styled empty state (muted icon or dashed-border placeholder + heading + description). Uses scoped CSS inheriting the project's CSS variable tokens.

### Modified files

- **`frontend/src/features/tasks/components/TaskColumn.vue`**
  - Add `flowSlug` to the props interface.
  - Replace line 28 (`<div v-if="tasks.length === 0" class="column__empty">No tasks</div>`) with `<TaskColumnEmptyState :flow-slug="flowSlug" :status-slug="status.slug" />`.

- **`frontend/src/features/tasks/views/TaskBoardView.vue`**
  - Pass `:flow-slug="flowSlug"` to each `<TaskColumn>` (line 139-145).

### Tests

- `TaskColumnEmptyState.test.ts`: renders correct heading/description for known flow+status pairs; renders fallback for unknown combos.

## Part 2 — Guided tour

A custom tour overlay (no external library) shown once on first login, after the team-selection modal is dismissed.

### New files

- **`frontend/src/composables/useOnboardingTour.ts`** — Provide/inject composable (same pattern as `useAuth` and `useCurrentUser`). State: `isActive`, `currentStepIndex`, `steps: TourStep[]`, `hasCompletedTour` (reads `localStorage.getItem('taskflow_tour_completed')`). Methods: `startTour(steps)`, `next()`, `prev()`, `skip()`, `finish()`. Both `skip` and `finish` set the localStorage flag and deactivate.

  ```ts
  interface TourStep {
    id: string
    targetSelector: string   // CSS selector for the spotlight target
    title: string
    body: string
    placement: 'top' | 'bottom' | 'left' | 'right'
  }
  ```

- **`frontend/src/data/tourSteps.ts`** — Default steps array (5 steps):
  1. `.navbar__tabs` — "Use these tabs to switch between Flows, Projects, and Settings."
  2. `[data-testid="navbar-team-button"]` — "Switch teams or manage memberships."
  3. `.board__columns` — "Each column is a workflow stage. Tasks move left to right as they progress."
  4. `.board__create-btn` — "Create a new task in this flow."
  5. `.filter-bar` — "Narrow tasks by project, priority, assignee, or due date."

- **`frontend/src/components/TourOverlay.vue`** — Teleported (`<Teleport to="body">`) full-viewport overlay:
  - Semi-transparent backdrop with a `clip-path` polygon cutout around the target element (positioned via `getBoundingClientRect()`).
  - Tooltip div positioned relative to the target based on `placement`, with a CSS arrow triangle.
  - Contains: step title, body text, "N of M" counter, Back / Next (or Done on last step) / Skip buttons.
  - Recalculates position on `resize` and `scroll` events.
  - Keyboard: Escape → skip, ArrowRight → next, ArrowLeft → prev.
  - Guard: if `querySelector(targetSelector)` returns null, auto-advance to next step.
  - Calls `scrollIntoView({ behavior: 'smooth', block: 'center' })` if target is off-screen.

### Modified files

- **`frontend/src/App.vue`**
  - Import and call `provideOnboardingTour()` alongside `provideAuth()` / `provideCurrentUser()`.
  - Add `<TourOverlay />` in the template (after existing layout blocks).

- **`frontend/src/features/tasks/views/TaskBoardView.vue`**
  - In `onMounted`, after `loadStatuses()` and `loadTasks()` resolve, check `!tour.hasCompletedTour.value && !currentUser.needsTeamSelection.value`. If true, call `tour.startTour(defaultTourSteps)` inside `nextTick()` so the DOM is ready.

- **`frontend/src/style.css`**
  - Add CSS custom properties under `:root`:
    ```css
    --tour-backdrop: rgba(0, 0, 0, 0.5);
    --tour-tooltip-bg: var(--bg-primary);
    --tour-tooltip-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    --tour-spotlight-padding: 8px;
    --tour-spotlight-radius: 8px;
    ```

### Tests

- `useOnboardingTour.test.ts`: step navigation (next/prev boundaries), finish/skip set localStorage, `hasCompletedTour` reads localStorage correctly.
- `TourOverlay.test.ts`: renders when `isActive` is true, hides when false; displays correct step content; Back hidden on first step; "Done" label on last step.

## Out of scope

- Persisting tour state server-side or per-user (localStorage is sufficient).
- Animated transitions between tour steps.
- A "restart tour" button in settings (can be added later).
- Changing any backend code.

## Implementation order

1. `emptyStateContent.ts` → `TaskColumnEmptyState.vue` + test → wire into `TaskColumn` and `TaskBoardView`
2. `useOnboardingTour.ts` + test → `tourSteps.ts` → `TourOverlay.vue` + test → wire into `App.vue` and `TaskBoardView`
3. Add tour CSS variables to `style.css`
4. Manual E2E verification

## Done when

- Empty board columns show contextual help text instead of "No tasks".
- First login (after team selection) triggers a 5-step guided tour highlighting nav tabs, team selector, columns, create button, and filters.
- Completing or skipping the tour prevents it from showing again (survives page refresh).
- `cd frontend && npm test` is green.
