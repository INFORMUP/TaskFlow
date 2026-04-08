<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth";
import { useCurrentUser } from "@/composables/useCurrentUser";

const route = useRoute();
const router = useRouter();
const { logout } = useAuth();
const { user } = useCurrentUser();

const flows = [
  { slug: "bug", name: "Bugs" },
  { slug: "feature", name: "Features" },
  { slug: "improvement", name: "Improvements" },
];

function handleLogout() {
  logout();
  router.push({ name: "login" });
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
    </div>
    <div class="navbar__user">
      <span v-if="user">{{ user.displayName }}</span>
      <button class="navbar__logout" @click="handleLogout">Logout</button>
    </div>
  </nav>
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

.navbar__logout {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
}
</style>
