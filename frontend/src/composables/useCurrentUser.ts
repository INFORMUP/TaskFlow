import { ref, computed, provide, inject, type InjectionKey, type Ref, type ComputedRef } from "vue";
import { apiFetch } from "@/api/client";

export interface UserTeam {
  id: string;
  slug: string;
  name: string;
  isPrimary: boolean;
}

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string;
  actorType: string;
  status: string;
  teams: UserTeam[];
}

export interface TeamSelection {
  slug: string;
  isPrimary: boolean;
}

export interface CurrentUserStore {
  user: Ref<UserProfile | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  needsTeamSelection: ComputedRef<boolean>;
  load: () => Promise<void>;
  setTeams: (teams: TeamSelection[]) => Promise<void>;
  clear: () => void;
}

const USER_KEY: InjectionKey<CurrentUserStore> = Symbol("currentUser");

export function provideCurrentUser(): CurrentUserStore {
  const user = ref<UserProfile | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const needsTeamSelection = computed(
    () => !!user.value && user.value.teams.length === 0
  );

  async function load() {
    if (!localStorage.getItem("accessToken")) {
      user.value = null;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      user.value = await apiFetch<UserProfile>("/api/v1/users/me");
    } catch (e: any) {
      error.value = e?.error?.message || "Failed to load user";
    } finally {
      loading.value = false;
    }
  }

  async function setTeams(teams: TeamSelection[]) {
    user.value = await apiFetch<UserProfile>("/api/v1/users/me/teams", {
      method: "PUT",
      body: JSON.stringify({ teams }),
    });
  }

  function clear() {
    user.value = null;
    error.value = null;
  }

  const store: CurrentUserStore = {
    user,
    loading,
    error,
    needsTeamSelection,
    load,
    setTeams,
    clear,
  };
  provide(USER_KEY, store);
  return store;
}

export function useCurrentUser(): CurrentUserStore {
  const store = inject(USER_KEY);
  if (!store) throw new Error("useCurrentUser() called without provideCurrentUser()");
  return store;
}
