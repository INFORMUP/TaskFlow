<script setup lang="ts">
import { watch } from "vue";
import { useRoute } from "vue-router";
import { provideAuth } from "@/composables/useAuth";
import { provideCurrentUser, type TeamSelection } from "@/composables/useCurrentUser";
import AppLayout from "@/layouts/AppLayout.vue";
import AuthLayout from "@/layouts/AuthLayout.vue";
import TeamPickerModal from "@/features/auth/components/TeamPickerModal.vue";

const route = useRoute();

const auth = provideAuth();
const currentUser = provideCurrentUser();

// Load whenever the authentication state flips to true, and clear on logout.
watch(
  auth.isAuthenticated,
  (authed) => {
    if (authed) {
      currentUser.load();
    } else {
      currentUser.clear();
    }
  },
  { immediate: true }
);

async function handleTeamSelection(teams: TeamSelection[]) {
  await currentUser.setTeams(teams);
}
</script>

<template>
  <AuthLayout v-if="route.meta.layout === 'auth'">
    <router-view />
  </AuthLayout>
  <AppLayout v-else>
    <router-view />
    <TeamPickerModal
      v-if="currentUser.needsTeamSelection.value"
      :initial-selection="[]"
      title="Welcome to TaskFlow"
      submit-label="Join"
      @submit="handleTeamSelection"
    />
  </AppLayout>
</template>
