<script setup lang="ts">
import { useTaskFilters } from "../composables/useTaskFilters";

const { filters, setFilters } = useTaskFilters();
</script>

<template>
  <div class="view-toggle" role="group" aria-label="View mode">
    <button
      type="button"
      :aria-pressed="filters.view === 'board'"
      :class="{ 'view-toggle__btn--active': filters.view === 'board' }"
      @click="setFilters({ view: 'board' })"
    >
      Board
    </button>
    <button
      type="button"
      :aria-pressed="filters.view === 'list'"
      :class="{ 'view-toggle__btn--active': filters.view === 'list' }"
      @click="setFilters({ view: 'list' })"
    >
      List
    </button>
  </div>
</template>

<style scoped>
.view-toggle {
  display: inline-flex;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  overflow: hidden;
}
.view-toggle button {
  padding: 0.375rem 0.75rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
}
.view-toggle__btn--active {
  background: var(--accent);
  color: white;
}
</style>
