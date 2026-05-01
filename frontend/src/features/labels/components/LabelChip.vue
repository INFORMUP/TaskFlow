<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  name: string;
  color: string;
}>();

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

const textColor = computed(() => {
  const rgb = hexToRgb(props.color);
  if (!rgb) return "#000";
  // Relative luminance per WCAG; pick black on light, white on dark.
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5 ? "#111827" : "#ffffff";
});
</script>

<template>
  <span
    class="label-chip"
    :style="{ backgroundColor: color, color: textColor }"
    :title="name"
  >
    {{ name }}
  </span>
</template>

<style scoped>
.label-chip {
  display: inline-block;
  padding: 0.0625rem 0.4375rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
