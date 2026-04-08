import { describe, it, expect } from "vitest";
import router from "./index";

describe("router", () => {
  it("/ has redirect to /tasks/bug", () => {
    const matched = router.resolve("/");
    // The resolved route should point to /tasks/bug after redirect
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
