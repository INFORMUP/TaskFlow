<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  listFlows,
  listFlowIcons,
  listFlowStatuses,
  updateFlowIcon,
  updateFlowStatusColor,
  type Flow,
  type FlowStatus,
} from "@/api/flows.api";
import { listProjects, updateProject, type Project } from "@/api/projects.api";
import ProjectChip from "@/components/visual/ProjectChip.vue";
import FlowIcon from "@/components/visual/FlowIcon.vue";
import StageBadge from "@/components/visual/StageBadge.vue";

// Single admin page for the three visual customization axes (IMP-17):
//   - Project color (chip)
//   - Flow icon (curated set)
//   - Flow status color (pill)

interface FlowWithStatuses extends Flow {
  statuses: FlowStatus[];
}

const projects = ref<Project[]>([]);
const flows = ref<FlowWithStatuses[]>([]);
const icons = ref<string[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const saveError = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [ps, fs, ics] = await Promise.all([listProjects(), listFlows(), listFlowIcons()]);
    projects.value = ps;
    icons.value = ics;
    const withStatuses = await Promise.all(
      fs.map(async (f) => ({ ...f, statuses: await listFlowStatuses(f.id) })),
    );
    flows.value = withStatuses;
  } catch (e: any) {
    error.value = e?.error?.message ?? e?.message ?? "Failed to load settings";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function saveProjectColor(p: Project, color: string) {
  saveError.value = null;
  try {
    const updated = await updateProject(p.id, { color });
    p.color = updated.color;
  } catch (e: any) {
    saveError.value = e?.error?.message ?? "Failed to save project color";
  }
}

async function saveFlowIcon(f: FlowWithStatuses, icon: string) {
  saveError.value = null;
  try {
    const updated = await updateFlowIcon(f.id, icon || null);
    f.icon = updated.icon;
  } catch (e: any) {
    saveError.value = e?.error?.message ?? "Failed to save flow icon";
  }
}

async function saveStatusColor(f: FlowWithStatuses, s: FlowStatus, color: string) {
  saveError.value = null;
  try {
    const updated = await updateFlowStatusColor(f.id, s.id, color);
    s.color = updated.color;
  } catch (e: any) {
    saveError.value = e?.error?.message ?? "Failed to save status color";
  }
}

const sortedProjects = computed(() =>
  [...projects.value].sort((a, b) => a.key.localeCompare(b.key)),
);
</script>

<template>
  <div class="visuals" data-testid="visuals-settings">
    <h1 class="visuals__title">Visual customization</h1>
    <p class="visuals__sub">
      Customize how Project, Flow, and Stage appear across TaskFlow. Changes
      apply org-wide.
    </p>

    <p v-if="loading" class="visuals__status">Loading…</p>
    <p v-else-if="error" class="visuals__error" role="alert">{{ error }}</p>

    <p v-if="saveError" class="visuals__error" role="alert" data-testid="visuals-save-error">
      {{ saveError }}
    </p>

    <template v-if="!loading && !error">
      <section class="visuals__section" data-testid="visuals-projects">
        <h2 class="visuals__heading">Project colors</h2>
        <p class="visuals__sub">Pick a color for each project chip.</p>
        <ul class="visuals__list">
          <li v-for="p in sortedProjects" :key="p.id" class="visuals__row">
            <ProjectChip :project-key="p.key" :name="p.name" :color="p.color" />
            <span class="visuals__name">{{ p.name }}</span>
            <input
              type="color"
              :value="p.color || '#475569'"
              :data-testid="`project-color-${p.key}`"
              :aria-label="`Color for ${p.name}`"
              @change="saveProjectColor(p, ($event.target as HTMLInputElement).value)"
            />
          </li>
        </ul>
      </section>

      <section class="visuals__section" data-testid="visuals-flows">
        <h2 class="visuals__heading">Flow icons</h2>
        <p class="visuals__sub">
          Pick an icon from the curated set for each flow.
        </p>
        <ul class="visuals__list">
          <li v-for="f in flows" :key="f.id" class="visuals__row">
            <FlowIcon :icon="f.icon" :flow-name="f.name" :size="18" />
            <span class="visuals__name">{{ f.name }}</span>
            <select
              :value="f.icon ?? ''"
              :data-testid="`flow-icon-${f.slug}`"
              :aria-label="`Icon for ${f.name}`"
              @change="saveFlowIcon(f, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">— none —</option>
              <option v-for="ic in icons" :key="ic" :value="ic">{{ ic }}</option>
            </select>
          </li>
        </ul>
      </section>

      <section class="visuals__section" data-testid="visuals-statuses">
        <h2 class="visuals__heading">Stage colors</h2>
        <p class="visuals__sub">Pick a color for each stage pill, per flow.</p>
        <details
          v-for="f in flows"
          :key="f.id"
          class="visuals__flow-statuses"
          :data-testid="`flow-statuses-${f.slug}`"
        >
          <summary>{{ f.name }}</summary>
          <ul class="visuals__list">
            <li v-for="s in f.statuses" :key="s.id" class="visuals__row">
              <StageBadge :name="s.name" :color="s.color" />
              <span class="visuals__name">{{ s.name }}</span>
              <input
                type="color"
                :value="s.color || '#6b7280'"
                :data-testid="`status-color-${f.slug}-${s.slug}`"
                :aria-label="`Color for ${f.name} → ${s.name}`"
                @change="saveStatusColor(f, s, ($event.target as HTMLInputElement).value)"
              />
            </li>
          </ul>
        </details>
      </section>
    </template>
  </div>
</template>

<style scoped>
.visuals {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.visuals__title {
  font-size: 1.5rem;
  font-weight: 600;
}
.visuals__sub {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.visuals__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.875rem;
}
.visuals__status {
  color: var(--text-secondary);
}
.visuals__section {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius);
  padding: 1.25rem;
}
.visuals__heading {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.visuals__list {
  list-style: none;
  padding: 0;
  margin: 0.75rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.visuals__row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 0;
  border-bottom: 1px solid var(--border-soft);
}
.visuals__row:last-child {
  border-bottom: none;
}
.visuals__name {
  font-size: 0.875rem;
}
.visuals__flow-statuses {
  margin-top: 0.5rem;
  border-top: 1px solid var(--border-soft);
  padding-top: 0.5rem;
}
.visuals__flow-statuses summary {
  cursor: pointer;
  font-weight: 500;
  font-size: 0.875rem;
  padding: 0.25rem 0;
}
</style>
