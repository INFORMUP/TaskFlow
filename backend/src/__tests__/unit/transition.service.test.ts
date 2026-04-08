import { describe, it, expect } from "vitest";
import {
  validateTransition,
  validateNote,
  validateResolution,
  RESOLUTIONS,
} from "../../services/transition.service.js";

describe("transition.service", () => {
  // Simulated allowed transitions for a bug flow
  const allowedTransitions = [
    { fromStatusId: "s1", toStatusId: "s2" }, // triage -> investigate
    { fromStatusId: "s2", toStatusId: "s3" }, // investigate -> approve
    { fromStatusId: "s3", toStatusId: "s4" }, // approve -> resolve
    { fromStatusId: "s4", toStatusId: "s5" }, // resolve -> validate
    { fromStatusId: "s5", toStatusId: "s6" }, // validate -> closed
    { fromStatusId: "s2", toStatusId: "s1" }, // investigate -> triage (backward)
    { fromStatusId: "s1", toStatusId: "s6" }, // triage -> closed (any-to-closed)
  ];

  describe("validateTransition", () => {
    it("allows a valid forward transition", () => {
      const result = validateTransition("s1", "s2", allowedTransitions);
      expect(result.valid).toBe(true);
    });

    it("allows a valid backward transition", () => {
      const result = validateTransition("s2", "s1", allowedTransitions);
      expect(result.valid).toBe(true);
    });

    it("allows any-to-closed transition", () => {
      const result = validateTransition("s1", "s6", allowedTransitions);
      expect(result.valid).toBe(true);
    });

    it("rejects invalid transition (skipping intermediate)", () => {
      const result = validateTransition("s1", "s4", allowedTransitions);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("TRANSITION_NOT_ALLOWED");
      expect(result.allowedTargets).toBeDefined();
    });

    it("returns allowed targets on invalid transition", () => {
      const result = validateTransition("s1", "s4", allowedTransitions);
      expect(result.allowedTargets).toEqual(["s2", "s6"]);
    });
  });

  describe("validateNote", () => {
    it("accepts a non-empty note", () => {
      const result = validateNote("Valid note");
      expect(result.valid).toBe(true);
    });

    it("rejects an empty string", () => {
      const result = validateNote("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("NOTE_REQUIRED");
    });

    it("rejects whitespace-only note", () => {
      const result = validateNote("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("NOTE_REQUIRED");
    });

    it("rejects undefined note", () => {
      const result = validateNote(undefined as unknown as string);
      expect(result.valid).toBe(false);
    });
  });

  describe("validateResolution", () => {
    it("accepts valid bug resolution: fixed", () => {
      const result = validateResolution("bug", "fixed");
      expect(result.valid).toBe(true);
    });

    it("accepts valid bug resolution: cannot_reproduce", () => {
      const result = validateResolution("bug", "cannot_reproduce");
      expect(result.valid).toBe(true);
    });

    it("rejects invalid bug resolution: completed", () => {
      const result = validateResolution("bug", "completed");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("INVALID_RESOLUTION");
    });

    it("accepts valid feature resolution: completed", () => {
      const result = validateResolution("feature", "completed");
      expect(result.valid).toBe(true);
    });

    it("rejects invalid feature resolution: fixed", () => {
      const result = validateResolution("feature", "fixed");
      expect(result.valid).toBe(false);
    });

    it("accepts valid improvement resolution: deferred", () => {
      const result = validateResolution("improvement", "deferred");
      expect(result.valid).toBe(true);
    });

    it("rejects invalid improvement resolution: invalid", () => {
      const result = validateResolution("improvement", "invalid");
      expect(result.valid).toBe(false);
    });

    it("rejects unknown resolution value", () => {
      const result = validateResolution("bug", "unknown_value");
      expect(result.valid).toBe(false);
    });

    it("requires resolution when closing", () => {
      const result = validateResolution("bug", undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("RESOLUTION_REQUIRED");
    });
  });

  describe("RESOLUTIONS", () => {
    it("has correct values for bug", () => {
      expect(RESOLUTIONS.bug).toEqual(["fixed", "invalid", "duplicate", "wont_fix", "cannot_reproduce"]);
    });

    it("has correct values for feature", () => {
      expect(RESOLUTIONS.feature).toEqual(["completed", "rejected", "duplicate", "deferred"]);
    });

    it("has correct values for improvement", () => {
      expect(RESOLUTIONS.improvement).toEqual(["completed", "wont_fix", "deferred"]);
    });
  });
});
