import { configureAxe } from "vitest-axe";

// Component-level axe config.
//
// Disabled rules:
// - color-contrast: happy-dom does not fully resolve CSS variables, so
//   contrast must be verified in Playwright/browser instead.
// - region: complains that isolated components aren't wrapped in a
//   landmark. Landmark structure is an app-shell concern, not per-component.
export const axeComponent = configureAxe({
  rules: {
    "color-contrast": { enabled: false },
    region: { enabled: false },
  },
});
