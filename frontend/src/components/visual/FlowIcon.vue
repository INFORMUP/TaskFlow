<script setup lang="ts">
import { computed } from "vue";

// Curated icon set — keep in sync with backend/src/services/visual-customization.ts.
// Each entry maps to an inline SVG path so we don't pull in an icon library
// just for ~12 glyphs. All paths are 24x24 single-color stroke icons.
const ICON_PATHS: Record<string, string> = {
  bug: "M9 3h6M8 7h8a4 4 0 0 1 4 4v3a8 8 0 0 1-16 0v-3a4 4 0 0 1 4-4ZM3 11h2M19 11h2M4 17l2-1M20 17l-2-1",
  sparkles: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4l-6.6 6.6a2 2 0 1 0 2.8 2.8l6.6-6.6a4 4 0 0 0 5.4-5.4l-2.4 2.4-2-2 2.4-2.4Z",
  document: "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5",
  handshake: "M3 12l4-4 3 3 3-3 3 3 4-4M3 12l5 5h2l2 2 2-2h2l5-5",
  calendar: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM4 10h16M8 3v4M16 3v4",
  lightbulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c1 1 1.5 2 1.5 3.5h5c0-1.5.5-2.5 1.5-3.5A6 6 0 0 0 12 3Z",
  rocket: "M12 2c4 0 7 3 7 7l-3 3v5l-4 2-4-2v-5l-3-3c0-4 3-7 7-7ZM10 9a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM7 17l-3 3M17 17l3 3",
  shield: "M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3Z",
  flag: "M5 21V4M5 4h12l-2 4 2 4H5",
  star: "M12 3l2.7 6 6.3.6-4.8 4.4 1.4 6.3L12 17l-5.6 3.3 1.4-6.3L3 9.6 9.3 9 12 3Z",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
};

const props = defineProps<{
  icon?: string | null;
  flowName?: string;
  size?: number;
}>();

const path = computed(() => (props.icon ? ICON_PATHS[props.icon] ?? null : null));
const size = computed(() => props.size ?? 14);
</script>

<template>
  <span class="flow-icon" :title="flowName ?? icon ?? undefined">
    <svg
      v-if="path"
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path :d="path" />
    </svg>
    <span v-else class="flow-icon__fallback" aria-hidden="true">·</span>
    <span class="visually-hidden">{{ flowName ?? icon ?? "" }}</span>
  </span>
</template>

<style scoped>
.flow-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color, #475569);
}
.flow-icon__fallback {
  font-size: 0.875rem;
  line-height: 1;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
