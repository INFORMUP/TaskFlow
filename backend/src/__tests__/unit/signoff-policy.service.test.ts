import { describe, it, expect } from "vitest";
import { pickEffectivePolicyId } from "../../services/signoff-policy.service.js";

describe("signoff-policy.service", () => {
  describe("pickEffectivePolicyId", () => {
    it("returns task-level policy when all three levels are set", () => {
      const result = pickEffectivePolicyId("task-pol", "proj-pol", "org-pol");
      expect(result).toBe("task-pol");
    });

    it("falls back to project-level when task has none", () => {
      const result = pickEffectivePolicyId(null, "proj-pol", "org-pol");
      expect(result).toBe("proj-pol");
    });

    it("falls back to org-level when task and project have none", () => {
      const result = pickEffectivePolicyId(null, null, "org-pol");
      expect(result).toBe("org-pol");
    });

    it("returns null when no level has a policy", () => {
      const result = pickEffectivePolicyId(null, null, null);
      expect(result).toBeNull();
    });

    it("treats undefined the same as null", () => {
      const result = pickEffectivePolicyId(undefined, undefined, "org-pol");
      expect(result).toBe("org-pol");
    });

    it("skips undefined at task and project, returns org", () => {
      const result = pickEffectivePolicyId(undefined, null, "org-pol");
      expect(result).toBe("org-pol");
    });
  });
});
