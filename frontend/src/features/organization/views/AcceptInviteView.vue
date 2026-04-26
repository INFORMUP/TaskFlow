<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth";
import { useOrg } from "@/composables/useOrg";
import { acceptInvitation } from "@/api/organizations.api";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const org = useOrg();

const error = ref<string | null>(null);
const accepting = ref(false);

function tokenFromRoute(): string | null {
  const raw = route.query.token;
  if (typeof raw !== "string" || raw.length === 0) return null;
  return raw;
}

async function attemptAccept() {
  const token = tokenFromRoute();
  if (!token) {
    error.value = "This invitation link is missing or invalid.";
    return;
  }

  if (!auth.isAuthenticated.value) {
    const redirect = `/accept-invite?token=${encodeURIComponent(token)}`;
    await router.replace({ name: "login", query: { redirect } });
    return;
  }

  accepting.value = true;
  try {
    await acceptInvitation(token);
    await org.hydrate();
    await router.replace("/");
  } catch (e: any) {
    error.value = e?.error?.message || "Failed to accept invitation.";
  } finally {
    accepting.value = false;
  }
}

onMounted(() => {
  attemptAccept();
});
</script>

<template>
  <div class="accept-invite" data-testid="accept-invite-view">
    <h1 class="accept-invite__title">Accept invitation</h1>
    <p v-if="accepting" class="accept-invite__status">Accepting…</p>
    <p
      v-if="error"
      class="accept-invite__error"
      data-testid="accept-invite-error"
    >
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.accept-invite {
  max-width: 480px;
  margin: 3rem auto;
  text-align: center;
}
.accept-invite__title {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}
.accept-invite__status {
  color: var(--text-secondary);
}
.accept-invite__error {
  color: var(--priority-critical);
  font-size: 0.9375rem;
}
</style>
