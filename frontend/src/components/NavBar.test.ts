import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { ref } from "vue";
import NavBar from "./NavBar.vue";

vi.mock("@/composables/useAuth", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock("@/composables/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: ref({
      id: "u-1",
      displayName: "Alice",
      teams: [{ slug: "engineer", name: "Engineer", isPrimary: true }],
    }),
    setTeams: vi.fn(),
  }),
}));

vi.mock("@/composables/useOrg", () => ({
  useOrg: () => ({ activeOrg: ref(null) }),
}));

vi.mock("@/components/OrgSwitcher.vue", () => ({
  default: { template: "<div />" },
}));

vi.mock("@/features/auth/components/TeamPickerModal.vue", () => ({
  default: { template: "<div />" },
}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/tasks/new", name: "task-new", component: { template: "<div />" } },
    ],
  });
}

describe("NavBar — Add Task button", () => {
  beforeEach(() => {
    // No-op; mocks set up at module scope
  });

  it("renders a link to /tasks/new with an accessible label", async () => {
    const router = makeRouter();
    await router.push("/");
    await router.isReady();
    const wrapper = mount(NavBar, { global: { plugins: [router] } });
    await flushPromises();

    const link = wrapper.get('[data-testid="navbar-add-task-link"]');
    expect(link.attributes("href")).toBe("/tasks/new");
    expect(link.text()).toMatch(/add task/i);
  });
});
