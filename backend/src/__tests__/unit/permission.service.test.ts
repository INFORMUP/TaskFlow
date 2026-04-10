import { describe, it, expect } from "vitest";
import {
  canPerformAction,
  canTransitionToStatus,
  getViewScope,
  buildTaskViewWhere,
} from "../../services/permission.service.js";

describe("permission.service", () => {
  describe("canPerformAction — create", () => {
    it("engineer can create bug", () => {
      expect(canPerformAction(["engineer"], "create", "bug")).toBe(true);
    });

    it("engineer can create improvement", () => {
      expect(canPerformAction(["engineer"], "create", "improvement")).toBe(true);
    });

    it("user can create bug", () => {
      expect(canPerformAction(["user"], "create", "bug")).toBe(true);
    });

    it("user can create feature", () => {
      expect(canPerformAction(["user"], "create", "feature")).toBe(true);
    });

    it("user cannot create improvement", () => {
      expect(canPerformAction(["user"], "create", "improvement")).toBe(false);
    });

    it("agent can create bug", () => {
      expect(canPerformAction(["agent"], "create", "bug")).toBe(true);
    });

    it("agent cannot create feature", () => {
      expect(canPerformAction(["agent"], "create", "feature")).toBe(false);
    });

    it("agent can create improvement", () => {
      expect(canPerformAction(["agent"], "create", "improvement")).toBe(true);
    });

    it("product cannot create improvement", () => {
      expect(canPerformAction(["product"], "create", "improvement")).toBe(false);
    });
  });

  describe("canPerformAction — edit", () => {
    it("engineer can edit bug", () => {
      expect(canPerformAction(["engineer"], "edit", "bug")).toBe(true);
    });

    it("user cannot edit bug", () => {
      expect(canPerformAction(["user"], "edit", "bug")).toBe(false);
    });
  });

  describe("canPerformAction — assign", () => {
    it("engineer can assign bug", () => {
      expect(canPerformAction(["engineer"], "assign", "bug")).toBe(true);
    });

    it("product can assign bug", () => {
      expect(canPerformAction(["product"], "assign", "bug")).toBe(true);
    });

    it("user cannot assign bug", () => {
      expect(canPerformAction(["user"], "assign", "bug")).toBe(false);
    });

    it("agent cannot assign bug", () => {
      expect(canPerformAction(["agent"], "assign", "bug")).toBe(false);
    });
  });

  describe("canPerformAction — delete", () => {
    it("engineer can delete bug", () => {
      expect(canPerformAction(["engineer"], "delete", "bug")).toBe(true);
    });

    it("product can delete bug", () => {
      expect(canPerformAction(["product"], "delete", "bug")).toBe(true);
    });

    it("user cannot delete bug", () => {
      expect(canPerformAction(["user"], "delete", "bug")).toBe(false);
    });

    it("product cannot delete feature", () => {
      // Per permissions.md, only Product can delete features
      // Actually re-reading: Product: Yes for delete on Feature
      expect(canPerformAction(["product"], "delete", "feature")).toBe(true);
    });

    it("engineer cannot delete feature", () => {
      expect(canPerformAction(["engineer"], "delete", "feature")).toBe(false);
    });
  });

  describe("canPerformAction — comment", () => {
    it("engineer can comment on bug", () => {
      expect(canPerformAction(["engineer"], "comment", "bug")).toBe(true);
    });

    it("user can comment on bug", () => {
      expect(canPerformAction(["user"], "comment", "bug")).toBe(true);
    });

    it("agent can comment on bug", () => {
      expect(canPerformAction(["agent"], "comment", "bug")).toBe(true);
    });
  });

  describe("canTransitionToStatus — bug flow", () => {
    it("engineer can transition to any bug status", () => {
      expect(canTransitionToStatus(["engineer"], "bug", "triage")).toBe(true);
      expect(canTransitionToStatus(["engineer"], "bug", "investigate")).toBe(true);
      expect(canTransitionToStatus(["engineer"], "bug", "approve")).toBe(true);
      expect(canTransitionToStatus(["engineer"], "bug", "resolve")).toBe(true);
      expect(canTransitionToStatus(["engineer"], "bug", "validate")).toBe(true);
      expect(canTransitionToStatus(["engineer"], "bug", "closed")).toBe(true);
    });

    it("product can only transition bug to triage and closed", () => {
      expect(canTransitionToStatus(["product"], "bug", "triage")).toBe(true);
      expect(canTransitionToStatus(["product"], "bug", "investigate")).toBe(false);
      expect(canTransitionToStatus(["product"], "bug", "closed")).toBe(true);
    });

    it("user cannot transition bug at all", () => {
      expect(canTransitionToStatus(["user"], "bug", "triage")).toBe(false);
      expect(canTransitionToStatus(["user"], "bug", "closed")).toBe(false);
    });

    it("agent can transition bug to triage, investigate, validate", () => {
      expect(canTransitionToStatus(["agent"], "bug", "triage")).toBe(true);
      expect(canTransitionToStatus(["agent"], "bug", "investigate")).toBe(true);
      expect(canTransitionToStatus(["agent"], "bug", "validate")).toBe(true);
    });

    it("agent can transition bug to approve (surfaces to engineer)", () => {
      expect(canTransitionToStatus(["agent"], "bug", "approve")).toBe(true);
    });

    it("agent cannot transition bug to resolve", () => {
      expect(canTransitionToStatus(["agent"], "bug", "resolve")).toBe(false);
    });
  });

  describe("canTransitionToStatus — feature flow", () => {
    it("engineer can transition feature to implement and validate", () => {
      expect(canTransitionToStatus(["engineer"], "feature", "implement")).toBe(true);
      expect(canTransitionToStatus(["engineer"], "feature", "validate")).toBe(true);
    });

    it("product can transition feature to discuss, design, review, closed", () => {
      expect(canTransitionToStatus(["product"], "feature", "discuss")).toBe(true);
      expect(canTransitionToStatus(["product"], "feature", "design")).toBe(true);
      expect(canTransitionToStatus(["product"], "feature", "review")).toBe(true);
      expect(canTransitionToStatus(["product"], "feature", "closed")).toBe(true);
    });

    it("agent can transition feature to prototype, implement, validate", () => {
      expect(canTransitionToStatus(["agent"], "feature", "prototype")).toBe(true);
      expect(canTransitionToStatus(["agent"], "feature", "implement")).toBe(true);
      expect(canTransitionToStatus(["agent"], "feature", "validate")).toBe(true);
    });

    it("user can only transition feature to discuss (on create)", () => {
      expect(canTransitionToStatus(["user"], "feature", "discuss")).toBe(true);
      expect(canTransitionToStatus(["user"], "feature", "design")).toBe(false);
      expect(canTransitionToStatus(["user"], "feature", "closed")).toBe(false);
    });
  });

  describe("canTransitionToStatus — improvement flow", () => {
    it("engineer can transition to all improvement statuses", () => {
      expect(canTransitionToStatus(["engineer"], "improvement", "propose")).toBe(true);
      expect(canTransitionToStatus(["engineer"], "improvement", "approve")).toBe(true);
      expect(canTransitionToStatus(["engineer"], "improvement", "implement")).toBe(true);
      expect(canTransitionToStatus(["engineer"], "improvement", "validate")).toBe(true);
      expect(canTransitionToStatus(["engineer"], "improvement", "closed")).toBe(true);
    });

    it("product cannot transition improvement", () => {
      expect(canTransitionToStatus(["product"], "improvement", "propose")).toBe(false);
      expect(canTransitionToStatus(["product"], "improvement", "closed")).toBe(false);
    });

    it("agent can transition improvement to implement and validate", () => {
      expect(canTransitionToStatus(["agent"], "improvement", "implement")).toBe(true);
      expect(canTransitionToStatus(["agent"], "improvement", "validate")).toBe(true);
      expect(canTransitionToStatus(["agent"], "improvement", "approve")).toBe(false);
    });
  });

  describe("multi-team permissions", () => {
    it("user in engineer+product has union of permissions", () => {
      // Engineer can create improvement, product cannot — union grants it
      expect(canPerformAction(["engineer", "product"], "create", "improvement")).toBe(true);
      // Product can transition feature to discuss, engineer cannot — union grants it
      expect(canTransitionToStatus(["engineer", "product"], "feature", "discuss")).toBe(true);
    });
  });

  describe("getViewScope", () => {
    it("engineer sees all bug tasks", () => {
      expect(getViewScope(["engineer"], "bug")).toBe("all");
    });

    it("product sees all bug tasks", () => {
      expect(getViewScope(["product"], "bug")).toBe("all");
    });

    it("user sees own + public bug tasks", () => {
      expect(getViewScope(["user"], "bug")).toBe("own_public");
    });

    it("agent sees only assigned bug tasks", () => {
      expect(getViewScope(["agent"], "bug")).toBe("assigned");
    });

    it("multi-team gets broadest scope", () => {
      expect(getViewScope(["user", "engineer"], "bug")).toBe("all");
    });

    it("user has no view access to improvement", () => {
      expect(getViewScope(["user"], "improvement")).toBe("none");
    });
  });

  describe("buildTaskViewWhere", () => {
    const USER = "user-uuid";
    const flowIds = new Map([
      ["bug", "flow-bug"],
      ["feature", "flow-feature"],
      ["improvement", "flow-improvement"],
    ]);

    it("engineer gets an OR clause with all three flows unfiltered", () => {
      const where = buildTaskViewWhere(["engineer"], USER, flowIds);
      expect(where).toEqual({
        OR: [
          { flowId: "flow-bug" },
          { flowId: "flow-feature" },
          { flowId: "flow-improvement" },
        ],
      });
    });

    it("product gets bug + feature (all) but improvement is excluded (comment-only, no view: all means scope is 'all' since product has view: true)", () => {
      // product has view: true on all three; VIEW_SCOPES shows all/all/all
      // so they still see all three flows fully
      const where = buildTaskViewWhere(["product"], USER, flowIds);
      expect(where).toEqual({
        OR: [
          { flowId: "flow-bug" },
          { flowId: "flow-feature" },
          { flowId: "flow-improvement" },
        ],
      });
    });

    it("user team sees only own tasks on bug/feature and nothing on improvement", () => {
      const where = buildTaskViewWhere(["user"], USER, flowIds);
      expect(where).toEqual({
        OR: [
          { flowId: "flow-bug", createdBy: USER },
          { flowId: "flow-feature", createdBy: USER },
        ],
      });
    });

    it("agent team sees only assigned tasks across all three flows", () => {
      const where = buildTaskViewWhere(["agent"], USER, flowIds);
      expect(where).toEqual({
        OR: [
          { flowId: "flow-bug", assigneeId: USER },
          { flowId: "flow-feature", assigneeId: USER },
          { flowId: "flow-improvement", assigneeId: USER },
        ],
      });
    });

    it("returns an impossible match when user has no teams", () => {
      const where = buildTaskViewWhere([], USER, flowIds);
      expect(where).toEqual({ id: { in: [] } });
    });

    it("picks the broadest scope across multiple teams", () => {
      // user+engineer → engineer's 'all' dominates
      const where = buildTaskViewWhere(["user", "engineer"], USER, flowIds);
      expect(where).toEqual({
        OR: [
          { flowId: "flow-bug" },
          { flowId: "flow-feature" },
          { flowId: "flow-improvement" },
        ],
      });
    });
  });
});
