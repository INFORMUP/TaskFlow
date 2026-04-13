<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import ProjectForm from "@/features/projects/components/ProjectForm.vue";
import { createProject } from "@/api/projects.api";
import { fetchTeams, type Team } from "@/api/teams.api";
import { apiFetch } from "@/api/client";

const router = useRouter();

const teams = ref<Team[]>([]);
const flows = ref<{ id: string; slug: string; name: string }[]>([]);
const users = ref<{ id: string; displayName: string }[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  teams.value = await fetchTeams();
  // Flows and users: pull from a lightweight endpoint; reuse teams endpoint
  // shape for users if a users list isn't yet exposed.
  try {
    const res = await apiFetch<{ data: { id: string; slug: string; name: string }[] }>("/api/v1/flows");
    flows.value = res.data;
  } catch {
    flows.value = [];
  }
  try {
    const res = await apiFetch<{ data: { id: string; displayName: string }[] }>("/api/v1/users");
    users.value = res.data;
  } catch {
    users.value = [];
  }
});

async function handleSubmit(payload: any) {
  submitting.value = true;
  error.value = null;
  try {
    const created = await createProject(payload);
    router.push(`/projects/${created.id}`);
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to create project";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="project-new">
    <h1>New project</h1>
    <ProjectForm
      :teams="teams"
      :flows="flows"
      :users="users"
      :submitting="submitting"
      :error="error"
      @submit="handleSubmit"
      @cancel="router.push('/projects')"
    />
  </section>
</template>

<style scoped>
.project-new {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
