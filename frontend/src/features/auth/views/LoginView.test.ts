import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import LoginView from "./LoginView.vue";

const loginFn = vi.fn();

vi.mock("@/composables/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: { value: false },
    accessToken: { value: null },
    login: loginFn,
    logout: vi.fn(),
  }),
}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", name: "login", component: { template: "<div />" } },
      { path: "/tasks/:flow", name: "task-board", component: { template: "<div />" } },
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

async function mountLoginAt(search: string) {
  window.history.replaceState(null, "", "/login" + search);
  const router = makeRouter();
  await router.push("/login");
  const wrapper = mount(LoginView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  loginFn.mockReset();
  vi.restoreAllMocks();
});

describe("LoginView", () => {
  it("surfaces ?error returned by Google's redirect", async () => {
    const wrapper = await mountLoginAt(
      "?error=access_denied&error_description=User+declined"
    );

    const err = wrapper.find("[data-testid='login-error']");
    expect(err.exists()).toBe(true);
    expect(err.text()).toContain("User declined");
    expect(loginFn).not.toHaveBeenCalled();
  });

  it("surfaces a non-OK response from the auth callback", async () => {
    mockFetch({ error: { message: "invalid_grant" } }, 400);

    const wrapper = await mountLoginAt("?code=abc");

    const err = wrapper.find("[data-testid='login-error']");
    expect(err.exists()).toBe(true);
    expect(err.text()).toContain("invalid_grant");
    expect(loginFn).not.toHaveBeenCalled();
  });

  it("surfaces a 200 response missing tokens", async () => {
    mockFetch({}, 200);

    const wrapper = await mountLoginAt("?code=abc");

    const err = wrapper.find("[data-testid='login-error']");
    expect(err.exists()).toBe(true);
    expect(loginFn).not.toHaveBeenCalled();
  });

  it("logs in and redirects on success", async () => {
    mockFetch({ accessToken: "a.b.c", refreshToken: "r.s.t" }, 200);

    const wrapper = await mountLoginAt("?code=abc");

    expect(loginFn).toHaveBeenCalledWith("a.b.c", "r.s.t");
    expect(wrapper.find("[data-testid='login-error']").exists()).toBe(false);
  });
});
