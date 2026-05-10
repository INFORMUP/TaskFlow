<script setup lang="ts">
import { computed } from "vue";
import type { TaskLinkStatus } from "@/api/feedback.api";

const props = defineProps<{ status: TaskLinkStatus }>();

const STATUS_META: Record<
  TaskLinkStatus,
  { label: string; bg: string; fg: string }
> = {
  pending: { label: "Pending", bg: "#e5e7eb", fg: "#374151" },
  linked: { label: "Linked", bg: "#dcfce7", fg: "#166534" },
  skipped_no_config: { label: "No config", bg: "#f3f4f6", fg: "#4b5563" },
  skipped_no_project: { label: "No project", bg: "#fef3c7", fg: "#92400e" },
  skipped_no_flow: { label: "No flow", bg: "#fef3c7", fg: "#92400e" },
  failed_create: { label: "Failed: create", bg: "#fee2e2", fg: "#991b1b" },
  failed_link: { label: "Failed: link", bg: "#fee2e2", fg: "#991b1b" },
};

const meta = computed(() => STATUS_META[props.status]);
</script>

<template>
  <span
    class="feedback-status-badge"
    :style="{ backgroundColor: meta.bg, color: meta.fg }"
    :title="status"
  >
    {{ meta.label }}
  </span>
</template>

<style scoped>
.feedback-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}
</style>
