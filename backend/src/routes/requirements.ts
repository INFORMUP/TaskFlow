import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { enforceScope } from "../services/permission.service.js";
import { computeQuorum } from "../services/requirement.service.js";
import { resolveEffectivePolicyId, materializePolicySlots } from "../services/signoff-policy.service.js";
import { CommonErrorResponses } from "./_schemas.js";

// ── Shared params ────────────────────────────────────────────────────────────

const TaskParams = Type.Object({ id: Type.String({ format: "uuid" }) });
const RequirementParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  rid: Type.String({ format: "uuid" }),
});
const SlotParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  rid: Type.String({ format: "uuid" }),
  sid: Type.String({ format: "uuid" }),
});

// ── Shapes ───────────────────────────────────────────────────────────────────

const AttestationShape = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    actorId: Type.String({ format: "uuid" }),
    actorType: Type.String(),
    verdict: Type.String(),
    evidence: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const SlotShape = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    ordinal: Type.Number(),
    label: Type.String(),
    requiredActorType: Type.Union([Type.String(), Type.Null()]),
    requiredUserId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    attestations: Type.Array(AttestationShape),
  },
  { additionalProperties: true }
);

const QuorumShape = Type.Object(
  {
    verified: Type.Boolean(),
    signed: Type.Number(),
    total: Type.Number(),
    missing: Type.Array(Type.String()),
    notDistinct: Type.Boolean(),
  },
  { additionalProperties: true }
);

const ImageMetaShape = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    filename: Type.String(),
    mimeType: Type.String(),
    size: Type.Number(),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const RequirementShape = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    parentId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    number: Type.String(),
    ordinal: Type.Number(),
    statement: Type.String(),
    rationale: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    slots: Type.Array(SlotShape),
    quorum: QuorumShape,
    images: Type.Array(ImageMetaShape),
  },
  { additionalProperties: true }
);

// ── Channel enforcement ──────────────────────────────────────────────────────

function enforceChannel(
  request: { user: { scopes: string[] | null; actorType: string; id: string } },
  reply: { status: (c: number) => { send: (b: unknown) => unknown } },
  slot: { requiredActorType: string | null; requiredUserId: string | null }
): boolean {
  const { scopes, actorType, id: userId } = request.user;
  const isApiToken = scopes !== null;

  if (slot.requiredActorType === "agent") {
    // Must be an API token session with actorType=agent
    if (!isApiToken || actorType !== "agent") {
      reply.status(403).send({ error: { code: "CHANNEL_MISMATCH", message: "Agent slot requires an agent API token session" } });
      return false;
    }
  } else if (slot.requiredActorType === "human") {
    // Must be an interactive (JWT) session — reject API tokens
    if (isApiToken) {
      reply.status(403).send({ error: { code: "CHANNEL_MISMATCH", message: "Human slot requires an interactive (JWT) session" } });
      return false;
    }
  }

  if (slot.requiredUserId && slot.requiredUserId !== userId) {
    reply.status(403).send({ error: { code: "CHANNEL_MISMATCH", message: "This slot is reserved for a specific user" } });
    return false;
  }

  return true;
}

// ── Route helpers ────────────────────────────────────────────────────────────

async function loadRequirements(taskId: string) {
  return prisma.requirement.findMany({
    where: { taskId, isDeleted: false },
    orderBy: { ordinal: "asc" },
    include: {
      slots: {
        orderBy: { ordinal: "asc" },
        include: { attestations: { orderBy: { createdAt: "asc" } } },
      },
      requirementImages: {
        orderBy: { image: { createdAt: "asc" } },
        include: {
          image: { select: { id: true, filename: true, mimeType: true, size: true, createdAt: true } },
        },
      },
    },
  });
}

// Assign hierarchical decimal numbers (1, 1.1, 1.2, 2, 2.1 …) in-place.
// Mutates each element's `number` property; returns depth-first ordered array.
function assignNumbers(
  flat: (ReturnType<typeof buildRequirementResponse> & { number?: string })[],
  parentId: string | null = null,
  prefix = ""
): (ReturnType<typeof buildRequirementResponse> & { number: string })[] {
  const children = flat
    .filter((r) => (r.parentId ?? null) === parentId)
    .sort((a, b) => a.ordinal - b.ordinal);

  const result: (ReturnType<typeof buildRequirementResponse> & { number: string })[] = [];
  children.forEach((r, i) => {
    const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
    (r as any).number = num;
    result.push(r as any);
    result.push(...assignNumbers(flat, r.id, num));
  });
  return result;
}

async function softDeleteTree(requirementId: string) {
  await prisma.requirement.update({ where: { id: requirementId }, data: { isDeleted: true } });
  const children = await prisma.requirement.findMany({
    where: { parentId: requirementId, isDeleted: false },
    select: { id: true },
  });
  for (const child of children) {
    await softDeleteTree(child.id);
  }
}

function buildRequirementResponse(req: Awaited<ReturnType<typeof loadRequirements>>[number]) {
  const quorum = computeQuorum(
    req.slots.map((s) => ({
      id: s.id,
      label: s.label,
      requiredActorType: s.requiredActorType,
      requiredUserId: s.requiredUserId,
    })),
    req.slots.flatMap((s) =>
      s.attestations.map((a) => ({
        slotId: s.id,
        actorId: a.actorId,
        actorType: a.actorType,
        verdict: a.verdict,
      }))
    )
  );
  const images = req.requirementImages.map((ri) => ({
    id: ri.image.id,
    filename: ri.image.filename,
    mimeType: ri.image.mimeType,
    size: ri.image.size,
    createdAt: ri.image.createdAt.toISOString(),
  }));
  return { ...req, quorum, images };
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function requirementRoutes(fastify: FastifyInstance) {
  // GET /api/v1/tasks/:id/requirements
  fastify.get(
    "/api/v1/tasks/:id/requirements",
    {
      schema: {
        summary: "List requirements for a task",
        tags: ["requirements"],
        params: TaskParams,
        response: { 200: Type.Array(RequirementShape), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { id } = request.params as { id: string };
      const reqs = await loadRequirements(id);
      const withQuorum = reqs.map(buildRequirementResponse);
      return reply.send(assignNumbers(withQuorum));
    }
  );

  // POST /api/v1/tasks/:id/requirements
  fastify.post(
    "/api/v1/tasks/:id/requirements",
    {
      schema: {
        summary: "Create a requirement on a task",
        description:
          "If `slots` is omitted, slots are materialized from the effective default policy (task → project → org). " +
          "Pass an explicit `slots` array (even empty) to bypass the default.",
        tags: ["requirements"],
        params: TaskParams,
        body: Type.Object({
          statement: Type.String({ minLength: 1 }),
          rationale: Type.Optional(Type.String()),
          parentId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
          ordinal: Type.Optional(Type.Number()),
          slots: Type.Optional(
            Type.Array(
              Type.Object({
                label: Type.String({ minLength: 1 }),
                ordinal: Type.Optional(Type.Number()),
                requiredActorType: Type.Optional(Type.Union([Type.String(), Type.Null()])),
                requiredUserId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
              })
            )
          ),
        }),
        response: { 201: RequirementShape, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { id } = request.params as { id: string };
      const { statement, rationale, parentId, ordinal, slots } = request.body as {
        statement: string;
        rationale?: string;
        parentId?: string | null;
        ordinal?: number;
        slots?: Array<{
          label: string;
          ordinal?: number;
          requiredActorType?: string | null;
          requiredUserId?: string | null;
        }>;
      };

      const resolvedParentId = parentId ?? null;
      const maxOrdinal = await prisma.requirement.aggregate({
        where: { taskId: id, parentId: resolvedParentId, isDeleted: false },
        _max: { ordinal: true },
      });
      const nextOrdinal = ordinal ?? (maxOrdinal._max.ordinal ?? 0) + 1;

      const req = await prisma.requirement.create({
        data: {
          taskId: id,
          parentId: resolvedParentId,
          statement,
          rationale: rationale ?? null,
          ordinal: nextOrdinal,
          createdBy: request.user.id,
        },
        include: { slots: { include: { attestations: true } } },
      });

      if (slots !== undefined) {
        // Explicit slots provided — create them by value (bypasses default policy).
        if (slots.length > 0) {
          await prisma.signoffSlot.createMany({
            data: slots.map((s, i) => ({
              requirementId: req.id,
              ordinal: s.ordinal ?? i + 1,
              label: s.label,
              requiredActorType: s.requiredActorType ?? null,
              requiredUserId: s.requiredUserId ?? null,
            })),
          });
        }
      } else {
        // No explicit slots — materialize from effective default policy if one exists.
        const policyId = await resolveEffectivePolicyId(id);
        if (policyId) {
          await materializePolicySlots(policyId, req.id);
        }
      }

      // Re-fetch all requirements to compute the correct hierarchical number.
      const allReqs = await loadRequirements(id);
      const withNumbers = assignNumbers(allReqs.map(buildRequirementResponse));
      const created = withNumbers.find((r) => r.id === req.id)!;
      return reply.status(201).send(created);
    }
  );

  // PATCH /api/v1/tasks/:id/requirements/:rid
  fastify.patch(
    "/api/v1/tasks/:id/requirements/:rid",
    {
      schema: {
        summary: "Update a requirement",
        tags: ["requirements"],
        params: RequirementParams,
        body: Type.Object({
          statement: Type.Optional(Type.String({ minLength: 1 })),
          rationale: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          ordinal: Type.Optional(Type.Number()),
        }),
        response: { 200: RequirementShape, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { id, rid } = request.params as { id: string; rid: string };
      const body = request.body as {
        statement?: string;
        rationale?: string | null;
        ordinal?: number;
      };

      await prisma.requirement.update({
        where: { id: rid },
        data: {
          ...(body.statement !== undefined && { statement: body.statement }),
          ...(body.rationale !== undefined && { rationale: body.rationale }),
          ...(body.ordinal !== undefined && { ordinal: body.ordinal }),
        },
      });

      // Re-fetch all to compute correct hierarchical number (same as POST)
      const allReqs = await loadRequirements(id);
      const withNumbers = assignNumbers(allReqs.map(buildRequirementResponse));
      const updated = withNumbers.find((r) => r.id === rid)!;
      return reply.send(updated);
    }
  );

  // DELETE /api/v1/tasks/:id/requirements/:rid
  fastify.delete(
    "/api/v1/tasks/:id/requirements/:rid",
    {
      schema: {
        summary: "Soft-delete a requirement",
        tags: ["requirements"],
        params: RequirementParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { rid } = request.params as { rid: string };
      await softDeleteTree(rid);
      return reply.status(204).send();
    }
  );

  // POST /api/v1/tasks/:id/requirements/:rid/slots
  fastify.post(
    "/api/v1/tasks/:id/requirements/:rid/slots",
    {
      schema: {
        summary: "Add a signoff slot to a requirement",
        tags: ["requirements"],
        params: RequirementParams,
        body: Type.Object({
          label: Type.String({ minLength: 1 }),
          ordinal: Type.Optional(Type.Number()),
          requiredActorType: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          requiredUserId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
        }),
        response: { 201: SlotShape, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { rid } = request.params as { rid: string };
      const { label, ordinal, requiredActorType, requiredUserId } = request.body as {
        label: string;
        ordinal?: number;
        requiredActorType?: string | null;
        requiredUserId?: string | null;
      };

      const maxOrdinal = await prisma.signoffSlot.aggregate({
        where: { requirementId: rid },
        _max: { ordinal: true },
      });
      const nextOrdinal = ordinal ?? (maxOrdinal._max.ordinal ?? 0) + 1;

      const slot = await prisma.signoffSlot.create({
        data: {
          requirementId: rid,
          label,
          ordinal: nextOrdinal,
          // AJV coerces JSON null to "" in string-union fields — normalize back to null
          requiredActorType: requiredActorType || null,
          requiredUserId: requiredUserId || null,
        },
        include: { attestations: true },
      });
      return reply.status(201).send(slot);
    }
  );

  // DELETE /api/v1/tasks/:id/requirements/:rid/slots/:sid
  fastify.delete(
    "/api/v1/tasks/:id/requirements/:rid/slots/:sid",
    {
      schema: {
        summary: "Remove a signoff slot",
        tags: ["requirements"],
        params: SlotParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { sid } = request.params as { sid: string };
      await prisma.signoffSlot.delete({ where: { id: sid } });
      return reply.status(204).send();
    }
  );

  // POST /api/v1/tasks/:id/requirements/:rid/slots/:sid/attestations
  fastify.post(
    "/api/v1/tasks/:id/requirements/:rid/slots/:sid/attestations",
    {
      schema: {
        summary: "Submit an attestation on a signoff slot",
        tags: ["requirements"],
        params: SlotParams,
        body: Type.Object({
          verdict: Type.String({ enum: ["met", "not_met"] }),
          evidence: Type.Optional(Type.String()),
        }),
        response: { 201: AttestationShape, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "attestations:write")) return;

      const { sid } = request.params as { sid: string };
      const { verdict, evidence } = request.body as { verdict: string; evidence?: string };

      const slot = await prisma.signoffSlot.findUnique({ where: { id: sid } });
      if (!slot) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Slot not found" } });
      }

      if (!enforceChannel(request as any, reply as any, slot)) return;

      const attestation = await prisma.attestation.create({
        data: {
          slotId: sid,
          actorId: request.user.id,
          actorType: request.user.actorType,
          verdict,
          evidence: evidence ?? null,
        },
      });
      return reply.status(201).send(attestation);
    }
  );
}
