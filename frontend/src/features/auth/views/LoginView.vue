<script setup lang="ts">
import { useAuth } from "@/composables/useAuth";
import { useRouter } from "vue-router";
import { config } from "@/config";

const { login } = useAuth();
const router = useRouter();

// Handle OAuth callback
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

if (code) {
  fetch(`${config.apiBaseUrl}/api/v1/auth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.accessToken) {
        login(data.accessToken, data.refreshToken);
        router.push("/tasks/bug");
      }
    });
}

function handleGoogleLogin() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = `${window.location.origin}/login`;
  const scope = "openid email profile";
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  window.location.href = url;
}
</script>

<template>
  <div class="login">
    <h1 class="login__title">TaskFlow</h1>
    <p class="login__subtitle">Agent-integrated task management</p>
    <button class="login__button" @click="handleGoogleLogin">
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
</style>
