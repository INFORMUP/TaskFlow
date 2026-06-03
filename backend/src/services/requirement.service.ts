export interface Slot {
  id: string;
  label: string;
  requiredActorType: string | null | undefined;
  requiredUserId: string | null | undefined;
}

export interface AttestationInput {
  slotId: string;
  actorId: string;
  actorType: string;
  verdict: string;
}

export interface QuorumResult {
  verified: boolean;
  signed: number;
  total: number;
  missing: string[];
  notDistinct: boolean;
}

export function computeQuorum(slots: Slot[], attestations: AttestationInput[]): QuorumResult {
  const total = slots.length;

  if (total === 0) {
    return { verified: true, signed: 0, total: 0, missing: [], notDistinct: false };
  }

  // Build latest-per-slot map (last element in array wins)
  const latestBySlot = new Map<string, AttestationInput>();
  for (const a of attestations) {
    latestBySlot.set(a.slotId, a);
  }

  const missing: string[] = [];
  const satisfiedActors: string[] = [];

  for (const slot of slots) {
    const latest = latestBySlot.get(slot.id);

    const isSatisfied =
      latest !== undefined &&
      latest.verdict === "met" &&
      (slot.requiredActorType == null || latest.actorType === slot.requiredActorType) &&
      (slot.requiredUserId == null || latest.actorId === slot.requiredUserId);

    if (isSatisfied) {
      satisfiedActors.push(latest!.actorId);
    } else {
      missing.push(slot.label);
    }
  }

  const signed = satisfiedActors.length;
  const verified = missing.length === 0;
  const notDistinct = new Set(satisfiedActors).size < satisfiedActors.length;

  return { verified, signed, total, missing, notDistinct };
}
