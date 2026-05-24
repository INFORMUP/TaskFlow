import { describe, it, expect, beforeEach } from "vitest";
import router from "./index";

beforeEach(() => {
  localStorage.clear();
});

describe("router", () => {
  it("/ resolves to the my-work route", () => {
    const route = router.resolve("/");
    expect(route.name).toBe("my-work");
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

  it("/projects/:id resolves to the project workspace (tasks), not settings", () => {
    const route = router.resolve("/projects/p-1");
    expect(route.name).toBe("project-workspace");
    expect(route.params.id).toBe("p-1");
  });

  it("/projects/:id/settings resolves to the project settings page", () => {
    const route = router.resolve("/projects/p-1/settings");
    expect(route.name).toBe("project-settings");
    expect(route.params.id).toBe("p-1");
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
