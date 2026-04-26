<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from "vue";
import ActorLabel from "@/components/ActorLabel.vue";

interface User {
  id: string;
  displayName: string;
  actorType: string;
}

const props = defineProps<{
  users: User[];
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [userId: string | null];
  close: [];
}>();

const filter = ref("");
const rootRef = ref<HTMLDivElement | null>(null);
const filterInputRef = ref<HTMLInputElement | null>(null);

const filteredUsers = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return props.users;
  return props.users.filter((u) => u.displayName.toLowerCase().includes(q));
});

function handleDocumentClick(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    emit("close");
  }
}

function handleKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close");
  }
}

onMounted(async () => {
  await nextTick();
  filterInputRef.value?.focus();
  document.addEventListener("mousedown", handleDocumentClick);
  document.addEventListener("keydown", handleKey);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleDocumentClick);
  document.removeEventListener("keydown", handleKey);
});
</script>

<template>
  <div ref="rootRef" class="picker" role="dialog" aria-label="Assign task">
    <input
      ref="filterInputRef"
      v-model="filter"
      class="picker__filter"
      type="text"
      placeholder="Search users…"
      aria-label="Filter assignees"
    />
    <ul class="picker__list">
      <li>
        <button
          type="button"
          class="picker__option"
          :class="{ 'picker__option--selected': selectedId === null }"
          @click="emit('select', null)"
        >
          Unassigned
        </button>
      </li>
      <li v-for="user in filteredUsers" :key="user.id">
        <button
          type="button"
          class="picker__option"
          :class="{ 'picker__option--selected': selectedId === user.id }"
          @click="emit('select', user.id)"
        >
          <ActorLabel :actor="user" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker {
  position: absolute;
  z-index: 50;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  width: 220px;
  max-height: 280px;
  display: flex;
  flex-direction: column;
}

.picker__filter {
  margin: 0.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  font: inherit;
  background: var(--bg-secondary);
  color: inherit;
}

.picker__list {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  overflow-y: auto;
}

.picker__option {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0.375rem 0.5rem;
  font: inherit;
  color: inherit;
  border-radius: 4px;
  cursor: pointer;
}

.picker__option:hover,
.picker__option:focus-visible {
  background: var(--bg-secondary);
  outline: none;
}

.picker__option--selected {
  font-weight: 600;
  background: var(--bg-secondary);
}
</style>
