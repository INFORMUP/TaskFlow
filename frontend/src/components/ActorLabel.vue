<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  actor: { displayName: string; actorType: string } | null | undefined;
  fallback?: string;
}>();

const isAgent = computed(() => props.actor?.actorType === "agent");
const label = computed(() => props.actor?.displayName ?? props.fallback ?? "—");
const title = computed(() =>
  isAgent.value ? `${label.value} — Agent` : label.value
);
</script>

<template>
  <span class="actor" :title="title" data-testid="actor-label">
    <span class="actor__name">{{ label }}</span>
    <span
      v-if="isAgent"
      class="actor__badge"
      data-testid="actor-agent-badge"
      aria-label="Agent"
    >
      <span aria-hidden="true">&#x2728;</span> Agent
    </span>
  </span>
</template>

<style scoped>
.actor {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.actor__badge {
  background: #dbeafe;
  color: #1d4ed8;
  padding: 0 0.375rem;
  border-radius: 3px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: uppercase;
}
</style>
