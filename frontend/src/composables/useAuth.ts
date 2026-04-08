import { ref, computed, provide, inject, type InjectionKey, type Ref } from "vue";

export interface AuthStore {
  isAuthenticated: Ref<boolean>;
  accessToken: Ref<string | null>;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

const AUTH_KEY: InjectionKey<AuthStore> = Symbol("auth");

export function provideAuth(): AuthStore {
  const accessToken = ref<string | null>(localStorage.getItem("accessToken"));
  const isAuthenticated = computed(() => !!accessToken.value);

  function login(token: string, refresh: string) {
    localStorage.setItem("accessToken", token);
    localStorage.setItem("refreshToken", refresh);
    accessToken.value = token;
  }

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    accessToken.value = null;
  }

  const store: AuthStore = { isAuthenticated, accessToken, login, logout };
  provide(AUTH_KEY, store);
  return store;
}

export function useAuth(): AuthStore {
  const store = inject(AUTH_KEY);
  if (!store) throw new Error("useAuth() called without provideAuth()");
  return store;
}
