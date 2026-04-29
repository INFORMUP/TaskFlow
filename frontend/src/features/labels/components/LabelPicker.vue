<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useLabels } from "../composables/useLabels";
import type { Label } from "@/api/labels.api";
import LabelChip from "./LabelChip.vue";

const props = defineProps<{
  modelValue: { id: string; name: string; color: string }[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  attach: [labelId: string];
  detach: [labelId: string];
}>();

const { labels, ensureLoaded } = useLabels();
const open = ref(false);
const filter = ref("");

onMounted(() => {
  ensureLoaded();
});

const selectedIds = computed(() => new Set(props.modelValue.map((l) => l.id)));

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return labels.value;
  return labels.value.filter((l) => l.name.toLowerCase().includes(q));
});

function toggle(label: Label) {
  if (props.disabled) return;
  if (selectedIds.value.has(label.id)) {
    emit("detach", label.id);
  } else {
    emit("attach", label.id);
  }
}

function toggleOpen() {
  if (props.disabled) return;
  open.value = !open.value;
}
</script>

<template>
  <div class="label-picker">
    <div class="label-picker__current">
      <LabelChip
        v-for="label in modelValue"
        :key="label.id"
        :name="label.name"
        :color="label.color"
      />
      <button
        type="button"
        class="label-picker__toggle"
        :disabled="disabled"
        :aria-expanded="open"
        @click="toggleOpen"
      >
        {{ open ? "Done" : modelValue.length === 0 ? "+ Add label" : "Edit" }}
      </button>
    </div>
    <div v-if="open" class="label-picker__menu" role="listbox">
      <input
        v-model="filter"
        type="text"
        class="label-picker__filter"
        placeholder="Search labels…"
        aria-label="Search labels"
      />
      <ul class="label-picker__list">
        <li v-for="label in filtered" :key="label.id">
          <button
            type="button"
            class="label-picker__option"
            :aria-pressed="selectedIds.has(label.id)"
            @click="toggle(label)"
          >
            <span class="label-picker__check">
              {{ selectedIds.has(label.id) ? "✓" : "" }}
            </span>
            <LabelChip :name="label.name" :color="label.color" />
          </button>
        </li>
        <li v-if="filtered.length === 0" class="label-picker__empty">
          No labels.
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.label-picker {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.label-picker__current {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
}

.label-picker__toggle {
  font-size: 0.75rem;
  background: none;
  border: 1px dashed var(--border-primary);
  border-radius: 4px;
  padding: 0.125rem 0.5rem;
  cursor: pointer;
  color: var(--text-secondary);
}

.label-picker__toggle:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.label-picker__menu {
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  background: var(--bg-primary);
  padding: 0.375rem;
  max-width: 18rem;
}

.label-picker__filter {
  width: 100%;
  padding: 0.25rem 0.375rem;
  font: inherit;
  font-size: 0.8125rem;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  margin-bottom: 0.25rem;
}

.label-picker__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 14rem;
  overflow-y: auto;
}

.label-picker__option {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  background: none;
  border: none;
  padding: 0.25rem 0.375rem;
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: 0.8125rem;
  border-radius: 4px;
}

.label-picker__option:hover,
.label-picker__option:focus-visible {
  background: var(--bg-secondary, #f3f4f6);
  outline: none;
}

.label-picker__check {
  width: 0.875rem;
  font-weight: 600;
}

.label-picker__empty {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  padding: 0.25rem 0.375rem;
  list-style: none;
}
</style>
