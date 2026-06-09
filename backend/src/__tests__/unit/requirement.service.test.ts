import { describe, it, expect } from "vitest";
import { computeQuorum } from "../../services/requirement.service.js";

describe("requirement.service", () => {
  describe("computeQuorum", () => {
    it("returns verified=true and notDistinct=false when all slots are met by distinct actors", () => {
      const slots = [
        { id: "slot-1", label: "implementer", requiredActorType: null, requiredUserId: null },
        { id: "slot-2", label: "requester", requiredActorType: null, requiredUserId: null },
      ];
      const attestations = [
        { slotId: "slot-1", actorId: "actor-a", actorType: "human", verdict: "met" },
        { slotId: "slot-2", actorId: "actor-b", actorType: "human", verdict: "met" },
      ];
      const result = computeQuorum(slots, attestations);
      expect(result.verified).toBe(true);
      expect(result.signed).toBe(2);
      expect(result.total).toBe(2);
      expect(result.missing).toEqual([]);
      expect(result.notDistinct).toBe(false);
    });

    it("returns verified=false and missing list when a slot has no met attestation", () => {
      const slots = [
        { id: "slot-1", label: "implementer", requiredActorType: null, requiredUserId: null },
        { id: "slot-2", label: "requester", requiredActorType: null, requiredUserId: null },
      ];
      const attestations = [
        { slotId: "slot-1", actorId: "actor-a", actorType: "human", verdict: "met" },
      ];
      const result = computeQuorum(slots, attestations);
      expect(result.verified).toBe(false);
      expect(result.signed).toBe(1);
      expect(result.total).toBe(2);
      expect(result.missing).toEqual(["requester"]);
      expect(result.notDistinct).toBe(false);
    });

    it("returns verified=true and notDistinct=true when same actor fills two slots", () => {
      const slots = [
        { id: "slot-1", label: "implementer", requiredActorType: null, requiredUserId: null },
        { id: "slot-2", label: "requester", requiredActorType: null, requiredUserId: null },
      ];
      const attestations = [
        { slotId: "slot-1", actorId: "actor-a", actorType: "human", verdict: "met" },
        { slotId: "slot-2", actorId: "actor-a", actorType: "human", verdict: "met" },
      ];
      const result = computeQuorum(slots, attestations);
      expect(result.verified).toBe(true);
      expect(result.signed).toBe(2);
      expect(result.notDistinct).toBe(true);
    });

    it("returns slot unmet when requiredActorType is 'human' but attested by API token (human actorType not from interactive session)", () => {
      // human slots specifically require interactive JWT — enforceChannel blocks API tokens at write time;
      // quorum still checks actorType for human slots
      const slots = [
        { id: "slot-1", label: "human-reviewer", requiredActorType: "human", requiredUserId: null },
      ];
      const attestations = [
        // actorType='agent' would be rejected by enforceChannel, but verify quorum also rejects
        { slotId: "slot-1", actorId: "actor-a", actorType: "agent", verdict: "met" },
      ];
      const result = computeQuorum(slots, attestations);
      expect(result.verified).toBe(false);
      expect(result.missing).toEqual(["human-reviewer"]);
    });

    it("agent slot is satisfied by a human actorType attestation (API token session)", () => {
      const slots = [
        { id: "slot-1", label: "agent-reviewer", requiredActorType: "agent", requiredUserId: null },
      ];
      const attestations = [
        { slotId: "slot-1", actorId: "actor-a", actorType: "human", verdict: "met" },
      ];
      const result = computeQuorum(slots, attestations);
      expect(result.verified).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("returns slot unmet when requiredUserId does not match", () => {
      const slots = [
        { id: "slot-1", label: "named-approver", requiredActorType: null, requiredUserId: "user-xyz" },
      ];
      const attestations = [
        { slotId: "slot-1", actorId: "actor-a", actorType: "human", verdict: "met" },
      ];
      const result = computeQuorum(slots, attestations);
      expect(result.verified).toBe(false);
      expect(result.missing).toEqual(["named-approver"]);
    });

    it("returns verified=true trivially when there are zero slots", () => {
      const result = computeQuorum([], []);
      expect(result.verified).toBe(true);
      expect(result.signed).toBe(0);
      expect(result.total).toBe(0);
      expect(result.missing).toEqual([]);
      expect(result.notDistinct).toBe(false);
    });

    it("uses latest attestation per slot (last met wins over earlier not_met)", () => {
      const slots = [
        { id: "slot-1", label: "reviewer", requiredActorType: null, requiredUserId: null },
      ];
      const attestations = [
        { slotId: "slot-1", actorId: "actor-a", actorType: "human", verdict: "not_met" },
        { slotId: "slot-1", actorId: "actor-b", actorType: "human", verdict: "met" },
      ];
      const result = computeQuorum(slots, attestations);
      expect(result.verified).toBe(true);
    });

    it("uses latest attestation per slot (last not_met supersedes earlier met)", () => {
      const slots = [
        { id: "slot-1", label: "reviewer", requiredActorType: null, requiredUserId: null },
      ];
      const attestations = [
        { slotId: "slot-1", actorId: "actor-a", actorType: "human", verdict: "met" },
        { slotId: "slot-1", actorId: "actor-b", actorType: "human", verdict: "not_met" },
      ];
      const result = computeQuorum(slots, attestations);
      expect(result.verified).toBe(false);
    });

    it("satisfies slot when both requiredActorType and requiredUserId match", () => {
      const slots = [
        { id: "slot-1", label: "named-agent", requiredActorType: "agent", requiredUserId: "agent-user-1" },
      ];
      const attestations = [
        { slotId: "slot-1", actorId: "agent-user-1", actorType: "agent", verdict: "met" },
      ];
      const result = computeQuorum(slots, attestations);
      expect(result.verified).toBe(true);
    });

    it("does not count a not_met attestation as signed", () => {
      const slots = [
        { id: "slot-1", label: "reviewer", requiredActorType: null, requiredUserId: null },
      ];
      const attestations = [
        { slotId: "slot-1", actorId: "actor-a", actorType: "human", verdict: "needs_changes" },
      ];
      const result = computeQuorum(slots, attestations);
      expect(result.verified).toBe(false);
      expect(result.signed).toBe(0);
      expect(result.missing).toEqual(["reviewer"]);
    });
  });
});
