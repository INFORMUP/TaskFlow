<script setup lang="ts">
import { ref, watch } from "vue";
import {
  getTaskBlockers,
  addTaskBlocker,
  removeTaskBlocker,
  getTasks,
  type BlockerRef,
} from "@/api/tasks.api";

const props = defineProps<{ taskId: string }>();
const emit = defineEmits<{ (e: "changed"): void }>();

const blockers = ref<BlockerRef[]>([]);
const blocking = ref<BlockerRef[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);
const newInput = ref("");

async function load() {
  error.value = null;
  try {
    const res = await getTaskBlockers(props.taskId);
    blockers.value = res.blockers;
    blocking.value = res.blocking;
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load blockers";
  }
}

watch(() => props.taskId, load, { immediate: true });

async function resolveTaskId(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  // displayId (e.g. FEAT-3) — search via list endpoint.
  try {
    const res = await getTasks({ q: trimmed });
    const match = res.data.find((t) => t.displayId.toUpperCase() === trimmed.toUpperCase());
    return match?.id ?? null;
  } catch {
    return null;
  }
}

async function handleAdd() {
  const trimmed = newInput.value.trim();
  if (!trimmed) return;
  busy.value = true;
  error.value = null;
  try {
    const id = await resolveTaskId(trimmed);
    if (!id) {
      error.value = `No task matched "${trimmed}"`;
      return;
    }
    await addTaskBlocker(props.taskId, id);
    newInput.value = "";
    await load();
    emit("changed");
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to add blocker";
  } finally {
    busy.value = false;
  }
}

async function handleRemove(blockingId: string) {
  busy.value = true;
  error.value = null;
  try {
    await removeTaskBlocker(props.taskId, blockingId);
    blockers.value = blockers.value.filter((b) => b.id !== blockingId);
    emit("changed");
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to remove blocker";
  } finally {
    busy.value = false;
  }
}

function taskHref(b: BlockerRef): string {
  return `/tasks/${b.flow.slug}/${b.id}`;
}

function isOpen(b: BlockerRef): boolean {
  return b.currentStatus.slug !== "closed";
}
</script>

<template>
  <section class="blockers">
    <h3>Blockers</h3>
    <p v-if="error" class="blockers__error" role="alert">{{ error }}</p>

    <div class="blockers__group">
      <h4>Blocked by</h4>
      <ul v-if="blockers.length" class="blockers__list">
        <li
          v-for="b in blockers"
          :key="b.id"
          :data-testid="`blocker-row-${b.id}`"
          class="blockers__item"
        >
          <a :href="taskHref(b)" class="blockers__link">
            <span class="blockers__display-id">{{ b.displayId }}</span>
            <span class="blockers__title">{{ b.title }}</span>
            <span class="blockers__status" :class="{ 'status--open': isOpen(b), 'status--closed': !isOpen(b) }">
              {{ b.currentStatus.name }}
            </span>
          </a>
          <button
            type="button"
            class="blockers__remove"
            :data-testid="`blocker-remove-${b.id}`"
            :disabled="busy"
            :aria-label="`Remove blocker ${b.displayId}`"
            @click="handleRemove(b.id)"
          >
            Remove
          </button>
        </li>
      </ul>
      <p v-else class="blockers__empty">No blockers.</p>

      <div class="blockers__add">
        <input
          v-model="newInput"
          type="text"
          placeholder="Task ID (e.g. FEAT-3) or UUID"
          data-testid="blocker-input"
          aria-label="Add blocker by task ID"
          :disabled="busy"
          @keydown.enter.prevent="handleAdd"
        />
        <button
          type="button"
          data-testid="blocker-add-button"
          :disabled="busy || !newInput.trim()"
          @click="handleAdd"
        >
          Add blocker
        </button>
      </div>
    </div>

    <div v-if="blocking.length" class="blockers__group">
      <h4>Blocks</h4>
      <ul class="blockers__list">
        <li
          v-for="b in blocking"
          :key="b.id"
          :data-testid="`blocking-row-${b.id}`"
          class="blockers__item"
        >
          <a :href="taskHref(b)" class="blockers__link">
            <span class="blockers__display-id">{{ b.displayId }}</span>
            <span class="blockers__title">{{ b.title }}</span>
            <span class="blockers__status">{{ b.currentStatus.name }}</span>
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.blockers {
  margin-top: 1.5rem;
}
.blockers h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}
.blockers__error {
  color: var(--color-danger, #c0392b);
  font-size: 0.85rem;
}
.blockers__group {
  margin-bottom: 1rem;
}
.blockers__group h4 {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-muted, #666);
}
.blockers__list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.blockers__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--color-border, #eee);
}
.blockers__link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: inherit;
  flex: 1;
  min-width: 0;
}
.blockers__display-id {
  font-family: monospace;
  font-weight: 600;
  font-size: 0.85rem;
}
.blockers__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.blockers__status {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--color-bg-muted, #f0f0f0);
}
.blockers__status.status--closed {
  opacity: 0.6;
  text-decoration: line-through;
}
.blockers__empty {
  font-size: 0.85rem;
  color: var(--color-text-muted, #888);
  margin: 0.25rem 0;
}
.blockers__add {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.blockers__add input {
  flex: 1;
  padding: 0.35rem 0.5rem;
}
.blockers__remove {
  font-size: 0.8rem;
}
</style>
