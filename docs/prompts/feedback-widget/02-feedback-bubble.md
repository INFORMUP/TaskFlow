# Phase 2 — Feedback bubble component

**Prerequisite:** Phase 1 ([`01-schema-and-api.md`](./01-schema-and-api.md)) is merged to `main`. The `POST /api/feedback` endpoint exists and is tested.

**Goal:** Add a floating feedback bubble to the bottom-right corner of every authenticated page. Users can open it, choose bug or enhancement, type a message, and submit — without leaving their current context.

## What to do

### API client (`frontend/src/api/feedback.api.ts`)

Add a `submitFeedback(payload)` function that calls `POST /api/feedback`. Follow the pattern of existing API files in `frontend/src/api/` (they use the shared `client.ts` axios instance).

```ts
export function submitFeedback(payload: {
  type: 'BUG' | 'ENHANCEMENT';
  message: string;
  page: string;
}): Promise<Feedback> { ... }
```

### Component (`frontend/src/components/FeedbackBubble.vue`)

A single-file Vue component with `<script setup lang="ts">`, `<template>`, and `<style scoped>`.

**Behavior:**

- **Collapsed state** (default): A circular floating button, fixed at `bottom: 1.5rem; right: 1.5rem`, `z-index: 500`. Use a message/chat icon (SVG inline or from an existing icon set if the project has one — do not add a new icon library).
- **Expanded state** (on click): A card panel (~320px wide) appears above the bubble button. Contains:
  - Header: "Send Feedback" label and a close button.
  - Type selector: Two toggle buttons — "Bug Report" and "Enhancement". Use color cues (e.g., red-tinted for bug, green-tinted for enhancement) via CSS variables or scoped styles.
  - Textarea: 4 rows, placeholder text varies by type ("Describe the bug..." / "Describe your idea...").
  - Submit button: Disabled when message is empty or submission is in flight. Keyboard shortcut: Cmd/Ctrl+Enter.
- **On submit**: Call `submitFeedback` with `{ type, message, page: window.location.href }`. Show a brief success state (checkmark + "Thanks!" for ~1.5 seconds), then reset the form and collapse.
- **On error**: Show a brief inline error message; do not collapse.

**Styling:**

- Use TaskFlow's CSS variable system (`var(--accent)`, `var(--bg-primary)`, `var(--border-primary)`, `var(--shadow-card)`, `var(--radius)`, etc.) — see `frontend/src/style.css`.
- No Tailwind, no utility classes. Scoped CSS only, following the BEM-like convention used in existing components.
- The bubble should feel native to TaskFlow's design, not like a bolted-on widget.

### Mount point (`frontend/src/layouts/AppLayout.vue`)

Add `<FeedbackBubble />` inside the `app-layout` div, after `<main>`. It renders via fixed positioning so it doesn't affect layout flow.

```vue
<template>
  <div class="app-layout">
    <NavBar />
    <main class="app-main">
      <slot />
    </main>
    <FeedbackBubble />
  </div>
</template>
```

### Tests

Use the existing Vitest + `@vue/test-utils` + happy-dom setup.

- Bubble renders in collapsed state by default.
- Clicking the bubble toggles to expanded state; clicking close returns to collapsed.
- Type selector toggles between BUG and ENHANCEMENT.
- Submit button is disabled when message is empty.
- Submitting calls `submitFeedback` with the correct payload shape (mock the API).
- After successful submit, the form resets and collapses.
- `page` field is populated with the current URL.

## Out of scope for this phase

- Admin feedback list view (Phase 3).
- Animations/transitions (nice-to-have, can be added later).
- Accessibility beyond basic keyboard navigation and focus management (the a11y audit prompt can sweep this later).

## Done when

- Every authenticated page shows a floating feedback bubble in the bottom-right.
- Clicking it opens a form; submitting creates a feedback record via the API.
- The component uses TaskFlow's CSS variable theming and looks native.
- `cd frontend && npm test` is green.
