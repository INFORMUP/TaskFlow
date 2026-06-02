import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTask, updateTask } from "./tasks.api";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe("tasks.api — spawnedFromTaskId wiring", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("updateTask sends spawnedFromTaskId in the PATCH body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "t-1" }));
    globalThis.fetch = fetchMock;

    const parentId = "11111111-1111-1111-1111-111111111111";
    await updateTask("t-1", { spawnedFromTaskId: parentId });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(lastBody(fetchMock)).toEqual({ spawnedFromTaskId: parentId });
  });

  it("updateTask sends explicit null to clear the parent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "t-1" }));
    globalThis.fetch = fetchMock;

    await updateTask("t-1", { spawnedFromTaskId: null });

    expect(lastBody(fetchMock)).toEqual({ spawnedFromTaskId: null });
  });

  it("createTask sends spawnedFromTaskId in the POST body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "t-2" }));
    globalThis.fetch = fetchMock;

    const parentId = "22222222-2222-2222-2222-222222222222";
    await createTask({
      flow: "feature",
      title: "Child",
      priority: "medium",
      spawnedFromTaskId: parentId,
    });

    expect(lastBody(fetchMock)).toMatchObject({ spawnedFromTaskId: parentId });
  });
});
