<script setup lang="ts">
import { computed } from "vue";
import { DEFAULT_STATUS_COLOR, readableTextColor } from "@/utils/contrast";

const props = defineProps<{
  name: string;
  color?: string | null;
}>();

const bg = computed(() => props.color || DEFAULT_STATUS_COLOR);
const fg = computed(() => readableTextColor(bg.value));
</script>

<template>
  <span
    class="stage-badge"
    :style="{ backgroundColor: bg, color: fg }"
    :title="name"
  >
    {{ name }}
  </span>
</template>

<style scoped>
.stage-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.0625rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
