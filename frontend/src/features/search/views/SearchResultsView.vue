<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { getTasks, type Task } from "@/api/tasks.api";
import FilterBar from "@/features/tasks/components/FilterBar.vue";
import TaskListView from "@/features/tasks/views/TaskListView.vue";
import { useTaskFilters, toApiParams } from "@/features/tasks/composables/useTaskFilters";

// Cross-flow search. Backed by GET /api/v1/tasks (no `flow` param), which already
// supports q + label (intersection) + priority/assignee/project/due. Status is
// intentionally excluded here because statuses differ per flow — FilterBar is
// mounted with an empty status set so its status chips don't render.
const { filters } = useTaskFilters();

const tasks = ref<Task[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const cursor = ref<string | null>(null);
const hasMore = ref(false);

const hasCriteria = computed(() => {
  const f = filters.value;
  return Boolean(
    f.q ||
      f.labelIds.length > 0 ||
      f.priority ||
      f.assigneeUserId ||
      f.projectId ||
      f.dueAfter ||
      f.dueBefore,
  );
});

async function load(append = false) {
  if (!hasCriteria.value) {
    tasks.value = [];
    cursor.value = null;
    hasMore.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const params = toApiParams(filters.value);
    if (append && cursor.value) params.cursor = cursor.value;
    const res = await getTasks(params);
    tasks.value = append ? [...tasks.value, ...res.data] : res.data;
    cursor.value = res.pagination.cursor;
    hasMore.value = res.pagination.hasMore;
  } catch (e: unknown) {
    error.value = (e as { error?: { message?: string } })?.error?.message ?? "Search failed";
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  load(true);
}

// `filters` is a computed off the route query, so it re-emits a fresh object
// whenever the URL changes — refetch (from page 1) on every filter change.
watch(filters, () => load(), { immediate: true });
</script>

<template>
  <section class="search-results">
    <header class="search-results__header">
      <h1>Search</h1>
    </header>

    <FilterBar :statuses="[]" />

    <p v-if="error" class="search-results__error" role="alert">{{ error }}</p>

    <template v-else>
      <p
        v-if="!hasCriteria"
        class="search-results__empty"
        data-testid="search-empty-prompt"
      >
        Enter a search term or pick a filter above to find tasks across all flows.
      </p>

      <template v-else>
        <p v-if="loading && tasks.length === 0" class="search-results__status">Searching…</p>
        <p
          v-else-if="tasks.length === 0"
          class="search-results__empty"
          data-testid="search-no-results"
        >
          No matching tasks.
        </p>
        <template v-else>
          <p class="search-results__count" data-testid="search-count">
            {{ tasks.length }} result{{ tasks.length === 1 ? "" : "s" }}{{ hasMore ? "+" : "" }}
          </p>
          <TaskListView :tasks="tasks" :show-flow="true" />
          <div v-if="hasMore" class="search-results__more">
            <button
              type="button"
              class="search-results__more-btn"
              data-testid="search-load-more"
              :disabled="loading"
              @click="loadMore"
            >
              {{ loading ? "Loading…" : "Load more" }}
            </button>
          </div>
        </template>
      </template>
    </template>
  </section>
</template>

<style scoped>
.search-results {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.search-results__header h1 {
  margin: 0;
}
.search-results__empty,
.search-results__status {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.search-results__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.875rem;
}
.search-results__count {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.search-results__more {
  display: flex;
  justify-content: center;
  padding: 0.5rem 0;
}
.search-results__more-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-primary);
  cursor: pointer;
  font-size: 0.875rem;
}
.search-results__more-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
