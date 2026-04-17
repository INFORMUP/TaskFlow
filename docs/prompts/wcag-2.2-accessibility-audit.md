# WCAG 2.2 AA accessibility audit & remediation

**Goal:** Bring the TaskFlow Vue frontend to WCAG 2.2 AA conformance, starting with the highest-risk surface (the task board / flow transition UI) and expanding outward. The app has custom interactive controls (status transitions, flow switching, token management) that are the most likely to fail keyboard, focus, and screen-reader checks. A user relying on a keyboard or screen reader should be able to complete every core flow: log in, view tasks in a flow, transition a task's status, and manage tokens.

## Scope & order

Work one surface at a time. Do not start the next until the previous is green.

1. **Task board + transition UI** (`frontend/src/features/tasks/**`, flow/status components) — highest interactivity, highest risk.
2. **Flows list / navigation** (`frontend/src/features/flows/**`, app shell, router-linked nav).
3. **Auth views** (`frontend/src/features/auth/views/LoginView.vue` and related) — forms, error messaging, OAuth button.
4. **Settings / token management** (`frontend/src/features/settings/**` or equivalent) — forms, destructive actions, copy-to-clipboard affordances.

## What to do, per surface

1. **Automated pass.** Run axe-core (via `@axe-core/playwright` or the `frontend:a11y` skill) against the surface in a logged-in state. Capture the raw findings as a checklist in a working note.
2. **Manual keyboard pass.** Tab/Shift-Tab through every interactive element. Confirm:
   - Focus order matches visual order.
   - Focus is always visible (WCAG 2.2 **2.4.11 Focus Not Obscured (Minimum)** and **2.4.13 Focus Appearance**).
   - Every control reachable by mouse is reachable by keyboard, including custom dropdowns, status pickers, and any drag-like interactions (provide a keyboard equivalent).
   - `Esc` closes dialogs/menus; focus returns to the trigger.
3. **Manual screen-reader pass.** Using VoiceOver (macOS) or NVDA (Windows), confirm every control announces a role, name, and state. Custom components must have correct ARIA (`role`, `aria-label`/`aria-labelledby`, `aria-expanded`, `aria-controls`, `aria-current`, etc.). Status badges need an accessible name, not just color.
4. **Remediate.** Fix findings in priority order:
   - **Blockers** (violations that prevent task completion for a keyboard or SR user): fix immediately.
   - **Serious** (contrast, missing labels, focus traps): fix in the same PR.
   - **Polish** (landmark structure, heading hierarchy, redundant ARIA): fix if cheap, otherwise file a follow-up prompt.
5. **Lock it in.** Add an axe-core assertion to the relevant component test (or a new Playwright smoke test) so regressions fail CI.

## WCAG 2.2 checks to pay special attention to

These are either new in 2.2 or historically weak in Vue SPAs:

- **2.4.11 Focus Not Obscured (Minimum)** — sticky headers/footers must not hide the focused element.
- **2.4.13 Focus Appearance** — custom focus rings must meet the size/contrast thresholds; do not rely on `:focus` alone, use `:focus-visible` with a visible indicator.
- **2.5.7 Dragging Movements** — if any interaction requires dragging (e.g., reordering), provide a non-dragging alternative (keyboard shortcut or menu action).
- **2.5.8 Target Size (Minimum)** — interactive targets ≥ 24×24 CSS pixels unless an exception applies.
- **3.3.7 Redundant Entry** — don't force re-entry of info already provided in the same session.
- **3.3.8 Accessible Authentication (Minimum)** — login must not require a cognitive test (e.g., transcribing a code with no paste allowed). OAuth via Google satisfies this; just confirm no paste-blocking on any future auth field.
- **1.4.3 Contrast (Minimum)** — status badge text, muted secondary text, disabled-state text. Run contrast checks in both light and any dark theme.
- **4.1.2 Name, Role, Value** — custom dropdowns, status pickers, and the transitions menu almost always fail this without explicit ARIA.
- **1.3.1 Info and Relationships** — forms must use real `<label>` elements (or `aria-labelledby`); error messages must be associated via `aria-describedby`.

## Tooling

- Add `@axe-core/playwright` (or `vitest-axe` for component-level checks) as a dev dependency in `frontend/`.
- Prefer component-level axe assertions where possible (faster, run in `npm test`). Use Playwright only for flows that span multiple views.
- If `frontend:a11y` skill output is used, save the raw report under `docs/action-items/` so the remediation PR can reference specific findings.

## Out of scope

- Full WCAG 2.2 AAA conformance.
- Visual redesign beyond what's needed to meet contrast / focus-appearance thresholds.
- Internationalization or RTL support.
- Backend API changes — this is a frontend-only effort unless a finding genuinely requires server work (unlikely).

## Done when

- Every surface listed in **Scope & order** passes automated axe checks with zero violations at the "serious" or "critical" level.
- A keyboard-only user can log in, open a flow, transition a task's status, and create/revoke a token without getting stuck.
- Focus is always visible; no sticky element obscures the focused control.
- At least one automated a11y assertion per surface runs in `cd frontend && npm test` and fails on regression.
- `cd frontend && npm test` is green.
