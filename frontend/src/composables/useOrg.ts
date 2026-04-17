import {
  ref,
  computed,
  provide,
  inject,
  type InjectionKey,
  type Ref,
  type ComputedRef,
} from "vue";
import {
  listOrganizations,
  switchOrganization,
  type OrgMembership,
} from "@/api/organizations.api";

const ACTIVE_ORG_INJECTION_KEY = "activeOrgId";

export interface OrgStore {
  memberships: Ref<OrgMembership[]>;
  activeOrg: ComputedRef<OrgMembership | null>;
  activeOrgId: Ref<string | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  hydrate: () => Promise<void>;
  addMembership: (m: OrgMembership) => void;
  setActiveOrg: (orgId: string) => Promise<void>;
  clear: () => void;
}

export const ORG_INJECTION_KEY: InjectionKey<OrgStore> = Symbol("org");

function readOrgIdFromToken(): string | null {
  const token = localStorage.getItem("accessToken");
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.orgId === "string" ? payload.orgId : null;
  } catch {
    return null;
  }
}

export function provideOrg(): OrgStore {
  const memberships = ref<OrgMembership[]>([]);
  const activeOrgId = ref<string | null>(
    localStorage.getItem(ACTIVE_ORG_INJECTION_KEY) || readOrgIdFromToken()
  );
  const loading = ref(false);
  const error = ref<string | null>(null);

  const activeOrg = computed(
    () => memberships.value.find((m) => m.id === activeOrgId.value) ?? null
  );

  function persistActive(orgId: string | null) {
    activeOrgId.value = orgId;
    if (orgId) localStorage.setItem(ACTIVE_ORG_INJECTION_KEY, orgId);
    else localStorage.removeItem(ACTIVE_ORG_INJECTION_KEY);
  }

  async function hydrate() {
    if (!localStorage.getItem("accessToken")) {
      memberships.value = [];
      persistActive(null);
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const res = await listOrganizations();
      memberships.value = res.data;

      if (res.data.length === 0) {
        persistActive(null);
        return;
      }

      const stored = localStorage.getItem(ACTIVE_ORG_INJECTION_KEY);
      const tokenOrgId = readOrgIdFromToken();
      const storedMatch = stored && res.data.find((m) => m.id === stored);
      const target = storedMatch
        ? stored
        : res.data.find((m) => m.id === tokenOrgId)?.id ?? res.data[0].id;

      if (target !== tokenOrgId) {
        await switchOrganization(target!);
      }
      persistActive(target!);
    } catch (e: any) {
      error.value = e?.error?.message || "Failed to load organizations";
    } finally {
      loading.value = false;
    }
  }

  async function setActiveOrg(orgId: string) {
    if (orgId === activeOrgId.value) return;
    if (!memberships.value.find((m) => m.id === orgId)) {
      throw new Error("Not a member of the requested organization");
    }
    await switchOrganization(orgId);
    persistActive(orgId);
  }

  function addMembership(m: OrgMembership) {
    const idx = memberships.value.findIndex((x) => x.id === m.id);
    if (idx >= 0) memberships.value[idx] = m;
    else memberships.value.push(m);
  }

  function clear() {
    memberships.value = [];
    error.value = null;
    persistActive(null);
  }

  const store: OrgStore = {
    memberships,
    activeOrg,
    activeOrgId,
    loading,
    error,
    hydrate,
    addMembership,
    setActiveOrg,
    clear,
  };
  provide(ORG_INJECTION_KEY, store);
  return store;
}

export function useOrg(): OrgStore {
  const store = inject(ORG_INJECTION_KEY);
  if (!store) throw new Error("useOrg() called without provideOrg()");
  return store;
}
