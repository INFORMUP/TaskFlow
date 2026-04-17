<script setup lang="ts">
import { onMounted, ref } from "vue";
import { listFlows, type Flow } from "@/api/flows.api";

const flows = ref<Flow[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    flows.value = await listFlows();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load flows";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="flows">
    <header class="flows__header">
      <h1>Flows</h1>
    </header>

    <p v-if="loading" class="flows__empty">Loading…</p>
    <p v-else-if="error" class="flows__error">{{ error }}</p>
    <p v-else-if="flows.length === 0" class="flows__empty">No flows found.</p>
    <table v-else class="flows__table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Slug</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in flows" :key="f.id" :data-testid="`flow-row-${f.slug}`">
          <td>
            <router-link
              :to="`/tasks/${f.slug}`"
              class="flows__name"
              :data-testid="`flow-link-${f.slug}`"
            >
              {{ f.name }}
            </router-link>
          </td>
          <td class="flows__slug">{{ f.slug }}</td>
          <td>{{ f.description ?? "—" }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.flows {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.flows__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.flows__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  background: var(--bg-primary);
  box-shadow: var(--shadow-card);
  border-radius: var(--radius);
  overflow: hidden;
}
.flows__table th,
.flows__table td {
  padding: 0.625rem 0.875rem;
  text-align: left;
  border-bottom: 1px solid var(--border-soft);
}
.flows__table th {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.03));
  font-weight: 600;
  color: var(--text-secondary);
}
.flows__name {
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}
.flows__slug {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-secondary);
}
.flows__empty,
.flows__error {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.flows__error {
  color: var(--priority-critical, #c0392b);
}
</style>
