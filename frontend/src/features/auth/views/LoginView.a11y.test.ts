import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import { axeComponent as axe } from "@/test/axe";
import LoginView from "./LoginView.vue";
import { ORG_INJECTION_KEY } from "@/composables/useOrg";

vi.mock("@/composables/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: { value: false },
    accessToken: { value: null },
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/api/organizations.api", () => ({
  switchOrganization: vi.fn(),
}));

function makeStore() {
  const memberships = ref([]);
  const activeOrgId = ref<string | null>(null);
  return {
    memberships,
    activeOrgId,
    activeOrg: computed(() => null),
    loading: ref(false),
    error: ref<string | null>(null),
    hydrate: vi.fn(async () => {}),
    addMembership: vi.fn(),
    setActiveOrg: vi.fn(),
    clear: vi.fn(),
  };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/login");
});

describe("Surface 3 — LoginView a11y", () => {
  it("has no axe violations on idle state", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/login", name: "login", component: { template: "<div />" } }],
    });
    await router.push("/login");
    const wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        provide: { [ORG_INJECTION_KEY as symbol]: makeStore() },
      },
      attachTo: document.body,
    });
    await flushPromises();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
