import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import AcceptInviteView from "./AcceptInviteView.vue";

const acceptInvitation = vi.fn();
vi.mock("@/api/organizations.api", () => ({
  acceptInvitation: (...a: unknown[]) => acceptInvitation(...a),
}));

const isAuthenticatedRef = ref(false);
vi.mock("@/composables/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: isAuthenticatedRef,
    accessToken: ref<string | null>(null),
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const hydrate = vi.fn(async () => {});
vi.mock("@/composables/useOrg", () => ({
  useOrg: () => ({ hydrate }),
}));

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "home", component: { template: "<div />" } },
      { path: "/login", name: "login", component: { template: "<div />" } },
      {
        path: "/accept-invite",
        name: "accept-invite",
        component: AcceptInviteView,
      },
    ],
  });
}

async function mountAt(path: string) {
  const router = makeRouter();
  await router.push(path);
  const wrapper = mount(AcceptInviteView, {
    global: { plugins: [router] },
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  acceptInvitation.mockReset();
  hydrate.mockClear();
  isAuthenticatedRef.value = false;
});

describe("AcceptInviteView", () => {
  it("shows an error when no token is present in the URL", async () => {
    isAuthenticatedRef.value = true;
    const { wrapper } = await mountAt("/accept-invite");
    expect(wrapper.find("[data-testid='accept-invite-error']").text()).toMatch(
      /missing|invalid/i,
    );
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to /login with redirect back to accept-invite", async () => {
    isAuthenticatedRef.value = false;
    const { router } = await mountAt("/accept-invite?token=tfinv_xyz");
    expect(router.currentRoute.value.path).toBe("/login");
    expect(router.currentRoute.value.query.redirect).toBe(
      "/accept-invite?token=tfinv_xyz",
    );
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("calls acceptInvitation and redirects home on success when authenticated", async () => {
    isAuthenticatedRef.value = true;
    acceptInvitation.mockResolvedValue({ id: "inv-1", orgId: "org-1" });

    const { router } = await mountAt("/accept-invite?token=tfinv_xyz");

    expect(acceptInvitation).toHaveBeenCalledWith("tfinv_xyz");
    expect(hydrate).toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("shows an error when acceptInvitation rejects", async () => {
    isAuthenticatedRef.value = true;
    acceptInvitation.mockRejectedValue({
      error: { message: "Invitation has expired" },
    });

    const { wrapper, router } = await mountAt("/accept-invite?token=tfinv_xyz");

    expect(router.currentRoute.value.path).toBe("/accept-invite");
    const err = wrapper.find("[data-testid='accept-invite-error']");
    expect(err.exists()).toBe(true);
    expect(err.text()).toContain("Invitation has expired");
  });
});
