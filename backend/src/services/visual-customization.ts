// Shared validation for the visual customization fields introduced by IMP-17:
//   - Project.color   (hex)
//   - FlowStatus.color (hex)
//   - Flow.icon       (slug from a curated set)
//
// Curated icon set is fixed for now per the IMP-17 propose decision.
// Adding another icon means adding it here and to the frontend's icon registry.

export class VisualCustomizationError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function assertHexColorOrNull(value: string | null | undefined, label = "Color"): void {
  if (value == null) return;
  if (!HEX_COLOR_PATTERN.test(value)) {
    throw new VisualCustomizationError(
      "INVALID_COLOR",
      `${label} must be a 6-digit hex color like #3b82f6`,
    );
  }
}

export const FLOW_ICON_SET = [
  "bug",
  "sparkles",
  "wrench",
  "document",
  "handshake",
  "calendar",
  "lightbulb",
  "rocket",
  "shield",
  "flag",
  "star",
  "target",
] as const;

export type FlowIconName = (typeof FLOW_ICON_SET)[number];

export function assertFlowIconOrNull(value: string | null | undefined): void {
  if (value == null) return;
  if (!(FLOW_ICON_SET as readonly string[]).includes(value)) {
    throw new VisualCustomizationError(
      "INVALID_ICON",
      `Icon must be one of: ${FLOW_ICON_SET.join(", ")}`,
    );
  }
}
