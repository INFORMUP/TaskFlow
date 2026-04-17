# Phase 3 — Admin feedback view

**Prerequisite:** Phase 2 ([`02-feedback-bubble.md`](./02-feedback-bubble.md)) is merged to `main`. The feedback bubble submits data; this phase gives org admins a place to review it.

**Goal:** Org `owner` and `admin` users can view, annotate, archive/unarchive, and export feedback from a dedicated settings-area view.

## What to do

### API client (extend `frontend/src/api/feedback.api.ts`)

Add the admin-facing API functions, consuming the endpoints built in Phase 1:

```ts
export function listFeedback(params: {
  page?: number;
  limit?: number;
  archived?: boolean;
}): Promise<{ data: Feedback[]; total: number; page: number; limit: number }>;

export function updateAdminNotes(id: string, adminNotes: string): Promise<Feedback>;

export function toggleArchive(id: string, archived: boolean): Promise<Feedback>;

export function exportFeedbackCsv(): Promise<Blob>;
```

### Route (`frontend/src/router/index.ts`)

Add a `/settings/feedback` route (or `/feedback` if settings doesn't exist yet — match existing conventions). Gate it to org `owner` or `admin` via route meta or a guard, consistent with how other admin routes are protected in this app.

### View (`frontend/src/features/feedback/views/FeedbackListView.vue`)

A table-based view showing feedback for the current org.

**Layout:**

- **Header row:** Title ("Feedback"), active/archived toggle, and an "Export CSV" button (right-aligned).
- **Table columns:** Type (badge), Message (truncated to ~80 chars), Page (as a link if present), Submitted by (user display name), Date.
- **Expandable rows:** Clicking a row expands it to show the full message and an admin-notes textarea.
- **Admin notes:** Textarea that auto-saves on blur (call `updateAdminNotes`). Show a subtle "Saved" indicator briefly after save.
- **Archive/Unarchive:** A button in the expanded row that toggles archive status.
- **Pagination:** Simple prev/next with page count, 20 items per page.
- **Empty state:** "No feedback yet" message when the list is empty.

**Type badges:**

- "Bug" — red-tinted background (`var(--priority-critical)` or similar).
- "Enhancement" — green-tinted background (`var(--priority-low)` or similar).

**CSV export:**

- Clicking "Export CSV" calls `exportFeedbackCsv()` and triggers a browser download.

**Styling:**

- Scoped CSS, CSS variables, BEM-like naming — same conventions as the rest of the app.
- Match the visual density and spacing of existing list/table views in TaskFlow (e.g., `FlowListView`, `ProjectListView`, or `SettingsView`).

### Navigation

Add a "Feedback" link in the appropriate navigation area (settings page sidebar, or nav bar — match how existing admin-only views are accessed). Only show it for org `owner` and `admin` roles.

### Tests

- View renders the feedback list with correct columns.
- Active/archived toggle switches the displayed list (mock API).
- Expanding a row shows full message and admin notes textarea.
- Saving admin notes calls `updateAdminNotes` with correct arguments.
- Archive button calls `toggleArchive`; row moves to archived list.
- Export button triggers CSV download.
- View is not accessible (404 or redirect) for users with org role `member`.
- Pagination: next/prev update the displayed page.

## Out of scope for this phase

- Real-time updates (manual refresh or re-fetch on action is fine).
- Feedback search or filtering beyond active/archived.
- Bulk actions (archive all, delete all).
- Inline reply to the feedback submitter.

## Done when

- Org `owner`/`admin` can navigate to the feedback view and see all submissions.
- Admin notes auto-save; archive/unarchive works; CSV export downloads.
- The view is hidden from / inaccessible to org `member` users.
- `cd frontend && npm test` is green.
