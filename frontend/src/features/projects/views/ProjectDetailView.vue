<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ProjectForm from "@/features/projects/components/ProjectForm.vue";
import {
  archiveProject,
  getProject,
  unarchiveProject,
  updateProject,
  type Project,
} from "@/api/projects.api";
import { fetchTeams, type Team } from "@/api/teams.api";
import { apiFetch } from "@/api/client";

const route = useRoute();
const router = useRouter();

const project = ref<Project | null>(null);
const teams = ref<Team[]>([]);
const flows = ref<{ id: string; slug: string; name: string }[]>([]);
const users = ref<{ id: string; displayName: string }[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);

async function load() {
  const id = route.params.id as string;
  project.value = await getProject(id);
}

onMounted(async () => {
  teams.value = await fetchTeams();
  try {
    flows.value = (await apiFetch<{ data: any[] }>("/api/v1/flows")).data;
  } catch {
    flows.value = [];
  }
  try {
    users.value = (await apiFetch<{ data: any[] }>("/api/v1/users")).data;
  } catch {
    users.value = [];
  }
  await load();
});

watch(() => route.params.id, load);

async function handleSubmit(payload: any) {
  if (!project.value) return;
  submitting.value = true;
  error.value = null;
  try {
    project.value = await updateProject(project.value.id, {
      name: payload.name,
      ownerUserId: payload.ownerUserId,
      defaultAssigneeUserId: payload.defaultAssigneeUserId,
      defaultFlowId: payload.defaultFlowId,
    });
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to save";
  } finally {
    submitting.value = false;
  }
}

async function toggleArchive() {
  if (!project.value) return;
  project.value = project.value.archivedAt
    ? await unarchiveProject(project.value.id)
    : await archiveProject(project.value.id);
}
</script>

<template>
  <section v-if="project" class="project-detail">
    <header class="project-detail__header">
      <div>
        <h1>{{ project.key }} · {{ project.name }}</h1>
        <p class="project-detail__meta">
          {{ project.archivedAt ? "Archived" : "Active" }} ·
          {{ project.teams.length }} team{{ project.teams.length === 1 ? "" : "s" }}
        </p>
      </div>
      <div class="project-detail__actions">
        <button @click="toggleArchive">
          {{ project.archivedAt ? "Unarchive" : "Archive" }}
        </button>
        <router-link to="/projects">Back</router-link>
      </div>
    </header>

    <ProjectForm
      :project="project"
      :teams="teams"
      :flows="flows"
      :users="users"
      :submitting="submitting"
      :error="error"
      @submit="handleSubmit"
      @cancel="router.push('/projects')"
    />
  </section>
  <p v-else>Loading…</p>
</template>

<style scoped>
.project-detail {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.project-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.project-detail__meta {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-top: 0.25rem;
}
.project-detail__actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.875rem;
}
.project-detail__actions button,
.project-detail__actions a {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  text-decoration: none;
  cursor: pointer;
  font-size: 0.8125rem;
}
</style>
