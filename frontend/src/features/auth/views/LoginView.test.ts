import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed } from "vue";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import LoginView from "./LoginView.vue";
import { ORG_INJECTION_KEY } from "@/composables/useOrg";
import type { OrgMembership } from "@/api/organizations.api";

const loginFn = vi.fn();

vi.mock("@/composables/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: { value: false },
    accessToken: { value: null },
    login: loginFn,
    logout: vi.fn(),
  }),
}));

const switchOrganization = vi.fn();
vi.mock("@/api/organizations.api", () => ({
  switchOrganization: (...a: unknown[]) => switchOrganization(...a),
}));

function makeStore(memberships: OrgMembership[], activeId: string | null = null) {
  const membershipsRef = ref(memberships);
  const activeOrgId = ref<string | null>(activeId);
  return {
    memberships: membershipsRef,
    activeOrgId,
    activeOrg: computed(
      () => membershipsRef.value.find((m) => m.id === activeOrgId.value) ?? null
    ),
    loading: ref(false),
    error: ref<string | null>(null),
    hydrate: vi.fn(async () => {
      /* test controls state directly */
    }),
    addMembership: vi.fn(),
    setActiveOrg: vi.fn(),
    clear: vi.fn(),
  };
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "home", component: { template: "<div />" } },
      { path: "/login", name: "login", component: { template: "<div />" } },
      {
        path: "/organization/new",
        name: "organization-new",
        component: { template: "<div />" },
      },
      {
        path: "/projects/:id",
        name: "project-detail",
        component: { template: "<div />" },
      },
    ],
  });
}

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response);
}

async function mountLoginAt(
  search: string,
  store = makeStore([], null)
) {
  window.history.replaceState(null, "", "/login" + search);
  const router = makeRouter();
  await router.push("/login");
  const wrapper = mount(LoginView, {
    global: {
      plugins: [router],
      provide: { [ORG_INJECTION_KEY as symbol]: store },
    },
  });
  await flushPromises();
  return { wrapper, router, store };
}

beforeEach(() => {
  loginFn.mockReset();
  switchOrganization.mockReset();
  switchOrganization.mockResolvedValue("new-token");
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("LoginView", () => {
  it("surfaces ?error returned by Google's redirect", async () => {
    const { wrapper } = await mountLoginAt(
      "?error=access_denied&error_description=User+declined"
    );

    const err = wrapper.find("[data-testid='login-error']");
    expect(err.exists()).toBe(true);
    expect(err.text()).toContain("User declined");
    expect(loginFn).not.toHaveBeenCalled();
  });

  it("surfaces a non-OK response from the auth callback", async () => {
    mockFetch({ error: { message: "invalid_grant" } }, 400);
    const { wrapper } = await mountLoginAt("?code=abc");
    const err = wrapper.find("[data-testid='login-error']");
    expect(err.exists()).toBe(true);
    expect(err.text()).toContain("invalid_grant");
    expect(loginFn).not.toHaveBeenCalled();
  });

  it("surfaces a 200 response missing tokens", async () => {
    mockFetch({}, 200);
    const { wrapper } = await mountLoginAt("?code=abc");
    expect(wrapper.find("[data-testid='login-error']").exists()).toBe(true);
    expect(loginFn).not.toHaveBeenCalled();
  });

  it("routes to /organization/new when the user has 0 memberships", async () => {
    mockFetch({ accessToken: "a.b.c", refreshToken: "r.s.t" }, 200);
    const store = makeStore([]);
    const { router } = await mountLoginAt("?code=abc", store);
    await flushPromises();

    expect(loginFn).toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe("/organization/new");
  });

  it("routes straight to the app when the user has exactly 1 membership", async () => {
    mockFetch({ accessToken: "a.b.c", refreshToken: "r.s.t" }, 200);
    const store = makeStore(
      [{ id: "org-1", slug: "acme", name: "Acme", role: "owner" }],
      "org-1"
    );
    const { router } = await mountLoginAt("?code=abc", store);
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/");
    expect(switchOrganization).not.toHaveBeenCalled();
  });

  it("falls back to the stored active org when many memberships exist", async () => {
    mockFetch({ accessToken: "a.b.c", refreshToken: "r.s.t" }, 200);
    localStorage.setItem("activeOrgId", "org-2");
    const store = makeStore(
      [
        { id: "org-1", slug: "acme", name: "Acme", role: "owner" },
        { id: "org-2", slug: "beta", name: "Beta", role: "member" },
      ],
      "org-1"
    );
    const { router } = await mountLoginAt("?code=abc", store);
    await flushPromises();

    expect(switchOrganization).toHaveBeenCalledWith("org-2");
    expect(localStorage.getItem("activeOrgId")).toBe("org-2");
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("falls back to the first membership when no active org is stored", async () => {
    mockFetch({ accessToken: "a.b.c", refreshToken: "r.s.t" }, 200);
    const store = makeStore(
      [
        { id: "org-1", slug: "acme", name: "Acme", role: "owner" },
        { id: "org-2", slug: "beta", name: "Beta", role: "member" },
      ],
      null
    );
    const { router } = await mountLoginAt("?code=abc", store);
    await flushPromises();

    expect(switchOrganization).toHaveBeenCalledWith("org-1");
    expect(router.currentRoute.value.path).toBe("/");
  });

  describe("redirect via OAuth state", () => {
    it("redirects to the path encoded in state after login", async () => {
      const state = btoa("/projects/42");
      mockFetch({ accessToken: "a.b.c", refreshToken: "r.s.t" }, 200);
      const store = makeStore(
        [{ id: "org-1", slug: "acme", name: "Acme", role: "owner" }],
        "org-1"
      );
      const { router } = await mountLoginAt(
        `?code=abc&state=${state}`,
        store
      );
      await flushPromises();

      expect(router.currentRoute.value.path).toBe("/projects/42");
    });

    it("falls back to / when state is absent", async () => {
      mockFetch({ accessToken: "a.b.c", refreshToken: "r.s.t" }, 200);
      const store = makeStore(
        [{ id: "org-1", slug: "acme", name: "Acme", role: "owner" }],
        "org-1"
      );
      const { router } = await mountLoginAt("?code=abc", store);
      await flushPromises();

      expect(router.currentRoute.value.path).toBe("/");
    });

    it("rejects state pointing to an external URL (https://)", async () => {
      const state = btoa("https://evil.example/x");
      mockFetch({ accessToken: "a.b.c", refreshToken: "r.s.t" }, 200);
      const store = makeStore(
        [{ id: "org-1", slug: "acme", name: "Acme", role: "owner" }],
        "org-1"
      );
      const { router } = await mountLoginAt(
        `?code=abc&state=${state}`,
        store
      );
      await flushPromises();

      expect(router.currentRoute.value.path).toBe("/");
    });

    it("rejects state with protocol-relative URL (//evil.example)", async () => {
      const state = btoa("//evil.example");
      mockFetch({ accessToken: "a.b.c", refreshToken: "r.s.t" }, 200);
      const store = makeStore(
        [{ id: "org-1", slug: "acme", name: "Acme", role: "owner" }],
        "org-1"
      );
      const { router } = await mountLoginAt(
        `?code=abc&state=${state}`,
        store
      );
      await flushPromises();

      expect(router.currentRoute.value.path).toBe("/");
    });
  });
});
