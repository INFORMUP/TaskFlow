<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useGlobalSearch } from "../composables/useGlobalSearch";
import { sanitizeSnippet } from "../sanitize";

const router = useRouter();
const { query, results, loading, clear } = useGlobalSearch();

const open = ref(false);
const activeIndex = ref(-1);
const rootRef = ref<HTMLElement | null>(null);

interface FlatItem {
  kind: "task" | "project";
  id: string;
  to: string;
}

const flatItems = computed<FlatItem[]>(() => {
  const items: FlatItem[] = [];
  for (const t of results.value.tasks) {
    items.push({ kind: "task", id: t.id, to: `/tasks/${t.flow.slug}/${t.id}` });
  }
  for (const p of results.value.projects) {
    items.push({ kind: "project", id: p.id, to: `/projects/${p.id}` });
  }
  return items;
});

const hasResults = computed(
  () => results.value.tasks.length > 0 || results.value.projects.length > 0,
);
const showDropdown = computed(
  () => open.value && query.value.trim().length >= 2,
);

function handleFocus() {
  open.value = true;
}

function handleInput() {
  open.value = true;
  activeIndex.value = -1;
}

function close() {
  open.value = false;
  activeIndex.value = -1;
}

function reset() {
  query.value = "";
  clear();
  close();
}

function selectAt(index: number) {
  const item = flatItems.value[index];
  if (!item) return;
  router.push(item.to);
  reset();
}

function moveActive(delta: number) {
  if (flatItems.value.length === 0) return;
  const next = activeIndex.value + delta;
  if (next < 0) activeIndex.value = flatItems.value.length - 1;
  else if (next >= flatItems.value.length) activeIndex.value = 0;
  else activeIndex.value = next;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    open.value = true;
    moveActive(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moveActive(-1);
  } else if (e.key === "Enter") {
    if (activeIndex.value >= 0) {
      e.preventDefault();
      selectAt(activeIndex.value);
    }
  } else if (e.key === "Escape") {
    if (query.value) {
      reset();
    } else {
      close();
    }
  }
}

function handleDocumentClick(e: MouseEvent) {
  if (!rootRef.value) return;
  if (!rootRef.value.contains(e.target as Node)) close();
}

function indexOfTask(taskIdx: number): number {
  return taskIdx;
}

function indexOfProject(projectIdx: number): number {
  return results.value.tasks.length + projectIdx;
}

function safeSnippet(raw: string): string {
  return sanitizeSnippet(raw);
}

function viewAllTasksHref(): string {
  return `/tasks?q=${encodeURIComponent(query.value.trim())}`;
}

onMounted(() => {
  document.addEventListener("mousedown", handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleDocumentClick);
});
</script>

<template>
  <div ref="rootRef" class="global-search" :class="{ 'global-search--open': showDropdown }">
    <input
      v-model="query"
      type="search"
      class="global-search__input"
      placeholder="Search tasks and projects"
      role="combobox"
      :aria-expanded="showDropdown"
      aria-controls="global-search-listbox"
      aria-autocomplete="list"
      aria-label="Search tasks and projects"
      autocomplete="off"
      data-testid="global-search-input"
      @focus="handleFocus"
      @input="handleInput"
      @keydown="handleKeydown"
    />
    <div
      v-if="showDropdown"
      id="global-search-listbox"
      class="global-search__panel"
      role="listbox"
      data-testid="global-search-panel"
    >
      <div v-if="loading && !hasResults" class="global-search__status">Searching…</div>
      <div v-else-if="!loading && !hasResults" class="global-search__status">
        No matches for "{{ query.trim() }}"
      </div>
      <template v-else>
        <section v-if="results.tasks.length > 0" class="global-search__group" aria-label="Tasks">
          <header class="global-search__group-title">Tasks</header>
          <button
            v-for="(task, idx) in results.tasks"
            :key="task.id"
            type="button"
            class="global-search__item"
            :class="{ 'global-search__item--active': activeIndex === indexOfTask(idx) }"
            role="option"
            :aria-selected="activeIndex === indexOfTask(idx)"
            data-testid="global-search-task"
            @mousedown.prevent="selectAt(indexOfTask(idx))"
            @mouseenter="activeIndex = indexOfTask(idx)"
          >
            <span class="global-search__item-id">{{ task.displayId }}</span>
            <span class="global-search__item-title">{{ task.title }}</span>
            <span
              class="global-search__item-snippet"
              v-html="safeSnippet(task.snippet)"
            />
          </button>
          <router-link
            class="global-search__view-all"
            :to="viewAllTasksHref()"
            @click="reset"
          >
            View all task results
          </router-link>
        </section>
        <section v-if="results.projects.length > 0" class="global-search__group" aria-label="Projects">
          <header class="global-search__group-title">Projects</header>
          <button
            v-for="(project, idx) in results.projects"
            :key="project.id"
            type="button"
            class="global-search__item"
            :class="{ 'global-search__item--active': activeIndex === indexOfProject(idx) }"
            role="option"
            :aria-selected="activeIndex === indexOfProject(idx)"
            data-testid="global-search-project"
            @mousedown.prevent="selectAt(indexOfProject(idx))"
            @mouseenter="activeIndex = indexOfProject(idx)"
          >
            <span class="global-search__item-id">{{ project.key }}</span>
            <span class="global-search__item-title">{{ project.name }}</span>
            <span
              class="global-search__item-snippet"
              v-html="safeSnippet(project.snippet)"
            />
          </button>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.global-search {
  position: relative;
  flex: 0 1 320px;
  max-width: 320px;
}

.global-search__input {
  width: 100%;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-primary);
  font-size: 0.875rem;
  color: var(--text-primary);
}

.global-search__input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.global-search__panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 50;
  max-height: 60vh;
  overflow-y: auto;
}

.global-search__status {
  padding: 0.75rem 1rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.global-search__group + .global-search__group {
  border-top: 1px solid var(--border-primary);
}

.global-search__group-title {
  padding: 0.5rem 1rem 0.25rem;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  font-weight: 600;
}

.global-search__item {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 0.5rem;
  align-items: baseline;
  width: 100%;
  padding: 0.5rem 1rem;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.global-search__item--active,
.global-search__item:hover {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
}

.global-search__item-id {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.global-search__item-title {
  font-weight: 500;
}

.global-search__item-snippet {
  grid-column: 1 / -1;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

.global-search__item-snippet :deep(mark) {
  background: var(--accent-soft, rgba(255, 230, 0, 0.4));
  color: inherit;
  padding: 0 1px;
}

.global-search__view-all {
  display: block;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  color: var(--accent);
  text-decoration: none;
}

.global-search__view-all:hover {
  text-decoration: underline;
}
</style>
