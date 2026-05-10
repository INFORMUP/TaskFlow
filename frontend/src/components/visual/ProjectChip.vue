<script setup lang="ts">
import { computed } from "vue";
import { DEFAULT_PROJECT_COLOR, readableTextColor } from "@/utils/contrast";

const props = defineProps<{
  projectKey: string;
  name?: string;
  color?: string | null;
}>();

const bg = computed(() => props.color || DEFAULT_PROJECT_COLOR);
const fg = computed(() => readableTextColor(bg.value));
</script>

<template>
  <span
    class="project-chip"
    :style="{ backgroundColor: bg, color: fg }"
    :title="name ?? projectKey"
  >
    {{ projectKey }}
  </span>
</template>

<style scoped>
.project-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.0625rem 0.4375rem;
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.2;
  text-transform: uppercase;
  white-space: nowrap;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
