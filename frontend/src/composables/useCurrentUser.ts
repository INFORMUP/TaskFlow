import { ref, provide, inject, type InjectionKey, type Ref } from "vue";
import { apiFetch } from "@/api/client";

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string;
  actorType: string;
  teams: { id: string; slug: string; name: string }[];
}

export interface CurrentUserStore {
  user: Ref<UserProfile | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  load: () => Promise<void>;
}

const USER_KEY: InjectionKey<CurrentUserStore> = Symbol("currentUser");

export function provideCurrentUser(): CurrentUserStore {
  const user = ref<UserProfile | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      // Use the users endpoint to get current user info
      // For now, decode from JWT payload
      const token = localStorage.getItem("accessToken");
      if (!token) return;

      const payload = JSON.parse(atob(token.split(".")[1]));
      const res = await apiFetch<{ data: UserProfile[] }>("/api/v1/users");
      const me = res.data.find((u) => u.id === payload.sub);
      if (me) user.value = me;
    } catch (e: any) {
      error.value = e.message || "Failed to load user";
    } finally {
      loading.value = false;
    }
  }

  const store: CurrentUserStore = { user, loading, error, load };
  provide(USER_KEY, store);
  return store;
}

export function useCurrentUser(): CurrentUserStore {
  const store = inject(USER_KEY);
  if (!store) throw new Error("useCurrentUser() called without provideCurrentUser()");
  return store;
}
