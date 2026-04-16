<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth";
import { useCurrentUser, type TeamSelection } from "@/composables/useCurrentUser";
import TeamPickerModal from "@/features/auth/components/TeamPickerModal.vue";

const route = useRoute();
const router = useRouter();
const { logout } = useAuth();
const { user, setTeams } = useCurrentUser();

const flows = [
  { slug: "bug", name: "Bugs" },
  { slug: "feature", name: "Features" },
  { slug: "improvement", name: "Improvements" },
];

const showTeamPicker = ref(false);

const primaryTeamName = computed(() => {
  if (!user.value) return null;
  const primary = user.value.teams.find((t) => t.isPrimary);
  return primary?.name ?? user.value.teams[0]?.name ?? null;
});

const currentSelection = computed<TeamSelection[]>(() =>
  (user.value?.teams ?? []).map((t) => ({ slug: t.slug, isPrimary: t.isPrimary }))
);

function handleLogout() {
  logout();
  router.push({ name: "login" });
}

async function handleTeamSubmit(teams: TeamSelection[]) {
  await setTeams(teams);
  showTeamPicker.value = false;
}
</script>

<template>
  <nav class="navbar">
    <div class="navbar__brand">TaskFlow</div>
    <div class="navbar__tabs">
      <router-link
        v-for="flow in flows"
        :key="flow.slug"
        :to="`/tasks/${flow.slug}`"
        class="navbar__tab"
        :class="{ 'navbar__tab--active': route.params.flow === flow.slug }"
      >
        {{ flow.name }}
      </router-link>
      <router-link
        to="/projects"
        class="navbar__tab"
        :class="{ 'navbar__tab--active': route.path.startsWith('/projects') }"
      >
        Projects
      </router-link>
      <router-link
        to="/settings"
        class="navbar__tab"
        :class="{ 'navbar__tab--active': route.path.startsWith('/settings') }"
        data-testid="navbar-settings-link"
      >
        Settings
      </router-link>
    </div>
    <div class="navbar__user">
      <button
        v-if="user && user.teams.length > 0"
        class="navbar__team"
        title="Manage your team memberships"
        data-testid="navbar-team-button"
        @click="showTeamPicker = true"
      >
        {{ primaryTeamName }}
        <span v-if="user.teams.length > 1" class="navbar__team-count">
          +{{ user.teams.length - 1 }}
        </span>
      </button>
      <span v-if="user">{{ user.displayName }}</span>
      <button class="navbar__logout" @click="handleLogout">Logout</button>
    </div>
  </nav>

  <TeamPickerModal
    v-if="showTeamPicker"
    :initial-selection="currentSelection"
    title="Manage your teams"
    submit-label="Save"
    :dismissible="true"
    @submit="handleTeamSubmit"
    @cancel="showTeamPicker = false"
  />
</template>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1.5rem;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-primary);
}

.navbar__brand {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--accent);
}

.navbar__tabs {
  display: flex;
  gap: 0.25rem;
  flex: 1;
}

.navbar__tab {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
}

.navbar__tab--active {
  background: var(--accent);
  color: white;
}

.navbar__user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.navbar__team {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--border-primary);
  background: transparent;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 500;
}

.navbar__team:hover {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
}

.navbar__team-count {
  color: var(--text-secondary);
  font-weight: 400;
}

.navbar__logout {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
}
</style>
