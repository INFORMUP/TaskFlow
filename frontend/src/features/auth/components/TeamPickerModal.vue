<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { fetchTeams, type Team } from "@/api/teams.api";

interface Selection {
  slug: string;
  isPrimary: boolean;
}

const props = defineProps<{
  initialSelection: Selection[];
  title?: string;
  submitLabel?: string;
  dismissible?: boolean;
}>();

const emit = defineEmits<{
  (e: "submit", teams: Selection[]): void;
  (e: "cancel"): void;
}>();

const teams = ref<Team[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const selected = ref<Record<string, boolean>>({});
const primarySlug = ref<string | null>(null);

onMounted(async () => {
  try {
    teams.value = await fetchTeams();
  } catch (e: any) {
    loadError.value = e?.error?.message || "Failed to load teams";
  } finally {
    loading.value = false;
  }
});

watch(
  () => props.initialSelection,
  (init) => {
    selected.value = {};
    primarySlug.value = null;
    for (const s of init) {
      selected.value[s.slug] = true;
      if (s.isPrimary) primarySlug.value = s.slug;
    }
  },
  { immediate: true }
);

const selectedCount = computed(
  () => Object.values(selected.value).filter(Boolean).length
);

const canSubmit = computed(
  () =>
    selectedCount.value > 0 &&
    primarySlug.value !== null &&
    selected.value[primarySlug.value] === true
);

function toggle(slug: string, value: boolean) {
  selected.value[slug] = value;
  if (!value && primarySlug.value === slug) {
    primarySlug.value = null;
  }
  // Auto-mark first selection as primary if none set
  if (value && primarySlug.value === null) {
    primarySlug.value = slug;
  }
}

function setPrimary(slug: string) {
  primarySlug.value = slug;
  selected.value[slug] = true;
}

function handleSubmit() {
  if (!canSubmit.value) return;
  const payload: Selection[] = teams.value
    .filter((t) => selected.value[t.slug])
    .map((t) => ({ slug: t.slug, isPrimary: t.slug === primarySlug.value }));
  emit("submit", payload);
}
</script>

<template>
  <div class="team-picker__backdrop" role="dialog" aria-modal="true">
    <div class="team-picker">
      <h2 class="team-picker__title">{{ title || "Pick your team" }}</h2>
      <p class="team-picker__subtitle">
        Your permissions are the union across every team you join. To see how the
        app looks from a single team's perspective, join only that team.
      </p>

      <p v-if="loading">Loading teams…</p>
      <p v-else-if="loadError" class="team-picker__error">{{ loadError }}</p>

      <ul v-else class="team-picker__list">
        <li
          v-for="team in teams"
          :key="team.slug"
          class="team-picker__item"
          data-testid="team-item"
        >
          <label class="team-picker__row">
            <input
              type="checkbox"
              :checked="selected[team.slug] === true"
              :data-testid="`team-toggle-${team.slug}`"
              @change="toggle(team.slug, ($event.target as HTMLInputElement).checked)"
            />
            <span class="team-picker__name">{{ team.name }}</span>
            <span v-if="team.description" class="team-picker__desc">
              {{ team.description }}
            </span>
          </label>
          <label
            class="team-picker__primary"
            :class="{ 'team-picker__primary--disabled': !selected[team.slug] }"
          >
            <input
              type="radio"
              name="primary-team"
              :checked="primarySlug === team.slug"
              :disabled="!selected[team.slug]"
              :data-testid="`team-primary-${team.slug}`"
              @change="setPrimary(team.slug)"
            />
            Primary
          </label>
        </li>
      </ul>

      <div class="team-picker__actions">
        <button
          v-if="dismissible"
          type="button"
          class="team-picker__cancel"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="team-picker__submit"
          :disabled="!canSubmit"
          data-testid="team-picker-submit"
          @click="handleSubmit"
        >
          {{ submitLabel || "Continue" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.team-picker__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.team-picker {
  background: var(--bg-primary);
  border-radius: var(--radius);
  padding: 1.5rem;
  max-width: 32rem;
  width: 100%;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
}

.team-picker__title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
}

.team-picker__subtitle {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0 0 1rem;
}

.team-picker__list {
  list-style: none;
  padding: 0;
  margin: 0 0 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.team-picker__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.team-picker__row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex: 1;
  cursor: pointer;
}

.team-picker__name {
  font-weight: 500;
}

.team-picker__desc {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.team-picker__primary {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.team-picker__primary--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.team-picker__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.team-picker__cancel {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-primary);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
}

.team-picker__submit {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.team-picker__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.team-picker__error {
  color: #b91c1c;
}
</style>
