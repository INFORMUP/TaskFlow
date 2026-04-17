import { describe, it, expect, beforeEach } from "vitest";
import router from "./index";

beforeEach(() => {
  localStorage.clear();
});

describe("router", () => {
  it("/ has redirect to /flows", () => {
    const matched = router.resolve("/");
    expect(matched.matched.length).toBeGreaterThan(0);
  });

  it("/login route exists", () => {
    const route = router.resolve("/login");
    expect(route.name).toBe("login");
  });

  it("/tasks/:flow route exists", () => {
    const route = router.resolve("/tasks/bug");
    expect(route.name).toBe("task-board");
    expect(route.params.flow).toBe("bug");
  });

  it("/tasks/:flow/:taskId route exists", () => {
    const route = router.resolve("/tasks/bug/some-id");
    expect(route.name).toBe("task-detail");
    expect(route.params.flow).toBe("bug");
    expect(route.params.taskId).toBe("some-id");
  });
});

describe("auth guard redirect param", () => {
  it("attaches redirect query when bouncing a deep link", async () => {
    await router.push("/projects/42");

    expect(router.currentRoute.value.name).toBe("login");
    expect(router.currentRoute.value.query.redirect).toBe("/projects/42");
  });

  it("attaches redirect for nested task routes", async () => {
    await router.push("/tasks/bug/abc123");

    expect(router.currentRoute.value.name).toBe("login");
    expect(router.currentRoute.value.query.redirect).toBe(
      "/tasks/bug/abc123"
    );
  });

  it("omits redirect param when the original path is /", async () => {
    await router.push("/");

    expect(router.currentRoute.value.name).toBe("login");
    expect(router.currentRoute.value.query.redirect).toBeUndefined();
  });

  it("omits redirect param when navigating to /login", async () => {
    await router.push("/login");

    expect(router.currentRoute.value.name).toBe("login");
    expect(router.currentRoute.value.query.redirect).toBeUndefined();
  });
});
