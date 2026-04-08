<script setup lang="ts">
import { useRoute } from "vue-router";
import { provideAuth } from "@/composables/useAuth";
import { provideCurrentUser } from "@/composables/useCurrentUser";
import AppLayout from "@/layouts/AppLayout.vue";
import AuthLayout from "@/layouts/AuthLayout.vue";

const route = useRoute();

const auth = provideAuth();
const currentUser = provideCurrentUser();

if (auth.isAuthenticated.value) {
  currentUser.load();
}
</script>

<template>
  <AuthLayout v-if="route.meta.layout === 'auth'">
    <router-view />
  </AuthLayout>
  <AppLayout v-else>
    <router-view />
  </AppLayout>
</template>
