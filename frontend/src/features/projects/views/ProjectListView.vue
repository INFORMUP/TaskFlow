<script setup lang="ts">
import { onMounted, ref } from "vue";
import { listProjects, type Project } from "@/api/projects.api";
import { useCurrentUser } from "@/composables/useCurrentUser";

const projects = ref<Project[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const showArchived = ref(false);

const { user } = useCurrentUser();

async function load() {
  loading.value = true;
  error.value = null;
  try {
    projects.value = await listProjects({ archived: showArchived.value });
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load projects";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function canCreate() {
  return !!user.value?.teams.some((t) => t.slug === "engineer" || t.slug === "product");
}
</script>

<template>
  <section class="projects">
    <header class="projects__header">
      <h1>Projects</h1>
      <div class="projects__actions">
        <label class="projects__toggle">
          <input type="checkbox" v-model="showArchived" @change="load" />
          Show archived
        </label>
        <router-link
          v-if="canCreate()"
          to="/projects/new"
          class="projects__new"
          data-testid="new-project-link"
        >
          + New project
        </router-link>
      </div>
    </header>

    <p v-if="loading" class="projects__empty">Loading…</p>
    <p v-else-if="error" class="projects__error">{{ error }}</p>
    <p v-else-if="projects.length === 0" class="projects__empty">
      No projects yet.
    </p>
    <table v-else class="projects__table">
      <thead>
        <tr>
          <th>Key</th>
          <th>Name</th>
          <th>Owner</th>
          <th>Default assignee</th>
          <th>Default flow</th>
          <th>Teams</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in projects" :key="p.id">
          <td>
            <router-link :to="`/projects/${p.id}`" class="projects__key">
              {{ p.key }}
            </router-link>
          </td>
          <td>{{ p.name }}</td>
          <td>{{ p.owner.displayName }}</td>
          <td>{{ p.defaultAssignee?.displayName ?? "—" }}</td>
          <td>{{ p.defaultFlow?.name ?? "—" }}</td>
          <td>
            <span v-for="t in p.teams" :key="t.id" class="projects__team-chip">
              {{ t.slug }}
            </span>
          </td>
          <td>{{ p.archivedAt ? "Archived" : "Active" }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.projects {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.projects__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.projects__actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.875rem;
}
.projects__toggle {
  display: inline-flex;
  gap: 0.375rem;
  align-items: center;
  cursor: pointer;
}
.projects__new {
  padding: 0.5rem 0.875rem;
  background: var(--accent);
  color: white;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
}
.projects__new:hover {
  background: var(--accent-hover);
}
.projects__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  background: var(--bg-primary);
  box-shadow: var(--shadow-card);
  border-radius: var(--radius);
  overflow: hidden;
}
.projects__table th,
.projects__table td {
  padding: 0.625rem 0.875rem;
  text-align: left;
  border-bottom: 1px solid var(--border-soft);
}
.projects__table th {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.03));
  font-weight: 600;
  color: var(--text-secondary);
}
.projects__key {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}
.projects__team-chip {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  margin-right: 0.25rem;
  border-radius: 999px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
  font-size: 0.75rem;
}
.projects__empty,
.projects__error {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.projects__error {
  color: var(--priority-critical, #c0392b);
}
</style>
