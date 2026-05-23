<script setup lang="ts">
const DEFAULT_STATUS_COLOR = "#9ca3af";

defineProps<{ name: string; color?: string | null }>();
</script>

<template>
  <span
    class="status-badge"
    :style="{ borderLeftColor: color || DEFAULT_STATUS_COLOR }"
    >{{ name }}</span
  >
</template>

<style scoped>
.status-badge {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-left: 4px solid var(--color-text-muted, #9ca3af);
  background: var(--bg-secondary, #f7f7f7);
  border-radius: 2px;
  white-space: nowrap;
}
</style>
