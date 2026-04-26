<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAuth } from "@/composables/useAuth";
import { useOrg } from "@/composables/useOrg";
import { useRoute, useRouter } from "vue-router";
import { config } from "@/config";
import { switchOrganization } from "@/api/organizations.api";

function isSafeRedirect(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}


const { login } = useAuth();
const org = useOrg();
const route = useRoute();
const router = useRouter();
const errorMessage = ref<string | null>(null);

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);

  const oauthError = params.get("error");
  if (oauthError) {
    const description = params.get("error_description");
    errorMessage.value = `Google sign-in was not completed: ${description || oauthError}`;
    return;
  }

  const code = params.get("code");
  if (!code) return;

  // Decode redirect target from OAuth state param
  let redirectTarget = "/";
  const stateParam = params.get("state");
  if (stateParam) {
    try {
      const decoded = atob(stateParam);
      if (isSafeRedirect(decoded)) {
        redirectTarget = decoded;
      }
    } catch {
      // invalid base64 — ignore, use default
    }
  }

  try {
    const redirectUri = `${window.location.origin}/login`;
    const res = await fetch(`${config.apiBaseUrl}/api/v1/auth/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirectUri }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.accessToken) {
      const serverMessage =
        (data && data.error && data.error.message) || data?.message;
      errorMessage.value = serverMessage
        ? `Sign-in failed: ${serverMessage}`
        : `Sign-in failed (HTTP ${res.status}).`;
      return;
    }

    login(data.accessToken, data.refreshToken);
    await org.hydrate();

    const memberships = org.memberships.value;
    if (memberships.length === 0) {
      router.push("/organization/new");
      return;
    }
    if (memberships.length === 1) {
      router.push(redirectTarget);
      return;
    }
    const stored = localStorage.getItem("activeOrgId");
    const target =
      (stored && memberships.find((m) => m.id === stored)?.id) ||
      memberships[0].id;
    if (target !== org.activeOrgId.value) {
      await switchOrganization(target);
    }
    localStorage.setItem("activeOrgId", target);
    router.push(redirectTarget);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "network error";
    errorMessage.value = `Sign-in failed: ${message}`;
  }
});

function handleGoogleLogin() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = `${window.location.origin}/login`;
  const scope = "openid email profile";
  const redirect = route.query.redirect as string | undefined;
  const stateValue = redirect && isSafeRedirect(redirect) ? btoa(redirect) : "";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
  });
  if (stateValue) {
    params.set("state", stateValue);
  }
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
</script>

<template>
  <div class="login">
    <h1 class="login__title">TaskFlow</h1>
    <p class="login__subtitle">Agent-integrated task management</p>
    <div
      v-if="errorMessage"
      class="login__error"
      data-testid="login-error"
      role="alert"
    >
      {{ errorMessage }}
    </div>
    <button type="button" class="login__button" @click="handleGoogleLogin">
      Sign in with Google
    </button>
  </div>
</template>

<style scoped>
.login {
  text-align: center;
}

.login__title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--accent);
}

.login__subtitle {
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
}

.login__button {
  width: 100%;
  padding: 0.75rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-weight: 500;
}

.login__button:hover {
  background: var(--accent-hover);
}

.login__error {
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  background: var(--error-bg, #fde2e2);
  color: var(--error-text, #842029);
  font-size: 0.875rem;
  text-align: left;
}
</style>
