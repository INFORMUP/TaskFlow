import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, computed } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import NavBar from "./NavBar.vue";
import { ORG_INJECTION_KEY } from "@/composables/useOrg";
import type { OrgMembership, OrgRole } from "@/api/organizations.api";

vi.mock("@/composables/useAuth", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));
vi.mock("@/composables/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: ref(null),
    setTeams: vi.fn(),
  }),
}));
vi.mock("@/components/OrgSwitcher.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/features/search/components/GlobalSearch.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/features/auth/components/TeamPickerModal.vue", () => ({
  default: { template: "<div />" },
}));

function makeStore(role: OrgRole | null) {
  const m: OrgMembership[] =
    role === null ? [] : [{ id: "org-1", slug: "acme", name: "Acme", role }];
  const memberships = ref(m);
  const activeOrgId = ref(role === null ? null : "org-1");
  return {
    memberships,
    activeOrgId,
    activeOrg: computed(
      () => memberships.value.find((x) => x.id === activeOrgId.value) ?? null,
    ),
    loading: ref(false),
    error: ref<string | null>(null),
    hydrate: vi.fn(),
    addMembership: vi.fn(),
    setActiveOrg: vi.fn(),
    clear: vi.fn(),
  };
}

async function mountNav(role: OrgRole | null) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/flows", component: { template: "<div />" } },
      { path: "/projects", component: { template: "<div />" } },
      { path: "/organization", component: { template: "<div />" } },
      { path: "/organization/feedback", component: { template: "<div />" } },
      { path: "/settings", component: { template: "<div />" } },
    ],
  });
  await router.push("/");
  await router.isReady();
  return mount(NavBar, {
    global: {
      plugins: [router],
      provide: { [ORG_INJECTION_KEY as symbol]: makeStore(role) },
    },
  });
}

describe("NavBar feedback link visibility", () => {
  it("shows the Feedback link to owners", async () => {
    const w = await mountNav("owner");
    expect(w.find("[data-testid='navbar-feedback-link']").exists()).toBe(true);
  });

  it("shows the Feedback link to admins", async () => {
    const w = await mountNav("admin");
    expect(w.find("[data-testid='navbar-feedback-link']").exists()).toBe(true);
  });

  it("hides the Feedback link from members", async () => {
    const w = await mountNav("member");
    expect(w.find("[data-testid='navbar-feedback-link']").exists()).toBe(false);
  });

  it("hides the Feedback link when there is no active org", async () => {
    const w = await mountNav(null);
    expect(w.find("[data-testid='navbar-feedback-link']").exists()).toBe(false);
  });
});
