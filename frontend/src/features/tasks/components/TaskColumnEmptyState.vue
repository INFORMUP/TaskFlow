<script setup lang="ts">
import { computed } from "vue";
import { getEmptyStateContent } from "@/data/emptyStateContent";

const props = defineProps<{
  flowSlug: string;
  statusSlug: string;
}>();

const content = computed(() =>
  getEmptyStateContent(props.flowSlug, props.statusSlug),
);
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon" aria-hidden="true">◇</div>
    <div class="empty-state__heading">{{ content.heading }}</div>
    <div class="empty-state__description">{{ content.description }}</div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1rem 0.75rem;
  border: 1px dashed var(--border-primary);
  border-radius: var(--radius);
  color: var(--text-secondary);
}

.empty-state__icon {
  font-size: 1.25rem;
  opacity: 0.5;
  margin-bottom: 0.25rem;
}

.empty-state__heading {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.empty-state__description {
  font-size: 0.75rem;
  line-height: 1.35;
}
</style>
