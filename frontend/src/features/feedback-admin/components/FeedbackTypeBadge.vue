<script setup lang="ts">
import { computed } from "vue";
import type { FeedbackType } from "@/api/feedback.api";

const props = defineProps<{ type: FeedbackType }>();

const variantClass = computed(() => {
  if (props.type === "BUG") return "feedback-type-badge--bug";
  if (props.type === "FEATURE") return "feedback-type-badge--feature";
  return "feedback-type-badge--improvement";
});
</script>

<template>
  <span
    class="feedback-type-badge"
    :class="variantClass"
    :data-feedback-type="type"
  >
    {{ type }}
  </span>
</template>

<style scoped>
.feedback-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  letter-spacing: 0.02em;
}

.feedback-type-badge--bug {
  background: #fee2e2;
  color: #991b1b;
}

.feedback-type-badge--feature,
.feedback-type-badge--improvement {
  background: #dcfce7;
  color: #166534;
}
</style>
