import { describe, it, expect } from "vitest";
import { deriveMilestoneStatus } from "../../services/task-rollup.service.js";

describe("task-rollup: deriveMilestoneStatus", () => {
  it("is not_started when there are no children", () => {
    expect(deriveMilestoneStatus({ childCount: 0, childDoneCount: 0 }, false)).toBe("not_started");
  });

  it("is not_started when children exist but none are done", () => {
    expect(deriveMilestoneStatus({ childCount: 3, childDoneCount: 0 }, false)).toBe("not_started");
  });

  it("is in_progress when some but not all children are done", () => {
    expect(deriveMilestoneStatus({ childCount: 4, childDoneCount: 1 }, false)).toBe("in_progress");
    expect(deriveMilestoneStatus({ childCount: 12, childDoneCount: 7 }, false)).toBe("in_progress");
  });

  it("is complete when all children are done", () => {
    expect(deriveMilestoneStatus({ childCount: 5, childDoneCount: 5 }, false)).toBe("complete");
  });

  it("a manually-closed (terminal) milestone always reads as complete", () => {
    // Manual override wins even with incomplete / zero children.
    expect(deriveMilestoneStatus({ childCount: 4, childDoneCount: 1 }, true)).toBe("complete");
    expect(deriveMilestoneStatus({ childCount: 0, childDoneCount: 0 }, true)).toBe("complete");
  });
});
