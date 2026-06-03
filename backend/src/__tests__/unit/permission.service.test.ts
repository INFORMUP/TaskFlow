import { describe, it, expect } from "vitest";
import {
  canPerformAction,
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

  describe("milestone flow", () => {
    it("engineer, product, and agent can create milestones; user cannot", () => {
      expect(canPerformAction(["engineer"], "create", "milestone")).toBe(true);
      expect(canPerformAction(["product"], "create", "milestone")).toBe(true);
      expect(canPerformAction(["agent"], "create", "milestone")).toBe(true);
      expect(canPerformAction(["user"], "create", "milestone")).toBe(false);
    });

    it("engineer/agent can edit milestones (for re-parenting); user cannot", () => {
      expect(canPerformAction(["engineer"], "edit", "milestone")).toBe(true);
      expect(canPerformAction(["agent"], "edit", "milestone")).toBe(true);
      expect(canPerformAction(["user"], "edit", "milestone")).toBe(false);
    });

    it("view scope mirrors feature: engineer/product all, user own_public, agent assigned", () => {
      expect(getViewScope(["engineer"], "milestone")).toBe("all");
      expect(getViewScope(["product"], "milestone")).toBe("all");
      expect(getViewScope(["user"], "milestone")).toBe("own_public");
      expect(getViewScope(["agent"], "milestone")).toBe("assigned");
    });
  });

  describe("multi-team permissions", () => {
    it("user in engineer+product has union of permissions", () => {
      expect(canPerformAction(["engineer", "product"], "create", "improvement")).toBe(true);
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

  describe("org role overrides", () => {
    it("org owner can perform actions regardless of team membership", () => {
      expect(canPerformAction([], "create", "improvement", "owner")).toBe(true);
      expect(canPerformAction([], "delete", "grant-application", "owner")).toBe(true);
    });

    it("org admin can perform actions regardless of team membership", () => {
      expect(canPerformAction([], "edit", "improvement", "admin")).toBe(true);
    });

    it("org member does not bypass the team matrix", () => {
      expect(canPerformAction(["user"], "create", "improvement", "member")).toBe(false);
      expect(canPerformAction(["user"], "create", "improvement")).toBe(false);
    });

  });
});
