// Pick black-vs-white text for a given hex background using WCAG relative luminance.
// Returns a string suitable for the `color` CSS property.
export function readableTextColor(hex: string | null | undefined): string {
  if (!hex) return "#111827";
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#111827";
  const v = parseInt(m[1], 16);
  const rgb = [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return lum > 0.5 ? "#111827" : "#ffffff";
}

// Default fallback when no color is set on the entity.
export const DEFAULT_PROJECT_COLOR = "#475569";
export const DEFAULT_STATUS_COLOR = "#6b7280";
