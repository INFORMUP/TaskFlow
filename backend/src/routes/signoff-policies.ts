import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma-client.js";
import { enforceScope } from "../services/permission.service.js";
import { CommonErrorResponses } from "./_schemas.js";

const PolicyParams = Type.Object({ policyId: Type.String({ format: "uuid" }) });
const SlotParams = Type.Object({
  policyId: Type.String({ format: "uuid" }),
  sid: Type.String({ format: "uuid" }),
});

const PolicySlotShape = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    policyId: Type.String({ format: "uuid" }),
    ordinal: Type.Number(),
    label: Type.String(),
    requiredActorType: Type.Union([Type.String(), Type.Null()]),
    requiredUserId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  },
  { additionalProperties: true }
);

const PolicyShape = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    orgId: Type.String({ format: "uuid" }),
    projectId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    slug: Type.String(),
    name: Type.String(),
    description: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    slots: Type.Array(PolicySlotShape),
  },
  { additionalProperties: true }
);

async function loadPolicy(orgId: string, policyId: string) {
  return prisma.signoffPolicy.findFirst({
    where: { id: policyId, orgId },
    include: { slots: { orderBy: { ordinal: "asc" } } },
  });
}

export async function signoffPolicyRoutes(fastify: FastifyInstance) {
  // POST /api/v1/signoff-policies
  fastify.post(
    "/api/v1/signoff-policies",
    {
      schema: {
        summary: "Create a sign-off policy",
        tags: ["signoff-policies"],
        body: Type.Object({
          slug: Type.String({ minLength: 1 }),
          name: Type.String({ minLength: 1 }),
          description: Type.Optional(Type.String()),
          projectId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
        }),
        response: { 201: PolicyShape, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { slug, name, description, projectId } = request.body as {
        slug: string;
        name: string;
        description?: string;
        projectId?: string | null;
      };

      try {
        const policy = await prisma.signoffPolicy.create({
          data: {
            orgId: request.org.id,
            slug,
            name,
            description: description ?? null,
            projectId: projectId ?? null,
          },
          include: { slots: { orderBy: { ordinal: "asc" } } },
        });
        return reply.status(201).send(policy);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.status(409).send({
            error: { code: "CONFLICT", message: "A policy with this name already exists" },
          });
        }
        throw err;
      }
    }
  );

  // GET /api/v1/signoff-policies
  fastify.get(
    "/api/v1/signoff-policies",
    {
      schema: {
        summary: "List sign-off policies for the org",
        tags: ["signoff-policies"],
        querystring: Type.Object({
          projectId: Type.Optional(Type.String({ format: "uuid" })),
        }),
        response: { 200: Type.Array(PolicyShape), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { projectId } = request.query as { projectId?: string };

      const policies = await prisma.signoffPolicy.findMany({
        where: {
          orgId: request.org.id,
          ...(projectId !== undefined ? { projectId } : {}),
        },
        include: { slots: { orderBy: { ordinal: "asc" } } },
        orderBy: { createdAt: "asc" },
      });
      return reply.send(policies);
    }
  );

  // GET /api/v1/signoff-policies/:policyId
  fastify.get(
    "/api/v1/signoff-policies/:policyId",
    {
      schema: {
        summary: "Get a sign-off policy",
        tags: ["signoff-policies"],
        params: PolicyParams,
        response: { 200: PolicyShape, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { policyId } = request.params as { policyId: string };
      const policy = await loadPolicy(request.org.id, policyId);
      if (!policy) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Policy not found" } });
      }
      return reply.send(policy);
    }
  );

  // PATCH /api/v1/signoff-policies/:policyId
  fastify.patch(
    "/api/v1/signoff-policies/:policyId",
    {
      schema: {
        summary: "Update a sign-off policy",
        tags: ["signoff-policies"],
        params: PolicyParams,
        body: Type.Object({
          name: Type.Optional(Type.String({ minLength: 1 })),
          description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        }),
        response: { 200: PolicyShape, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { policyId } = request.params as { policyId: string };
      const body = request.body as { name?: string; description?: string | null };

      const existing = await loadPolicy(request.org.id, policyId);
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Policy not found" } });
      }

      try {
        const policy = await prisma.signoffPolicy.update({
          where: { id: policyId },
          data: {
            ...(body.name !== undefined && { name: body.name }),
            ...(body.description !== undefined && { description: body.description }),
          },
          include: { slots: { orderBy: { ordinal: "asc" } } },
        });
        return reply.send(policy);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.status(409).send({
            error: { code: "CONFLICT", message: "A policy with this name already exists" },
          });
        }
        throw err;
      }
    }
  );

  // DELETE /api/v1/signoff-policies/:policyId
  fastify.delete(
    "/api/v1/signoff-policies/:policyId",
    {
      schema: {
        summary: "Delete a sign-off policy",
        tags: ["signoff-policies"],
        params: PolicyParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { policyId } = request.params as { policyId: string };

      const existing = await loadPolicy(request.org.id, policyId);
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Policy not found" } });
      }

      await prisma.signoffPolicy.delete({ where: { id: policyId } });
      return reply.status(204).send();
    }
  );

  // POST /api/v1/signoff-policies/:policyId/slots
  fastify.post(
    "/api/v1/signoff-policies/:policyId/slots",
    {
      schema: {
        summary: "Add a slot to a sign-off policy",
        tags: ["signoff-policies"],
        params: PolicyParams,
        body: Type.Object({
          label: Type.String({ minLength: 1 }),
          ordinal: Type.Optional(Type.Number()),
          requiredActorType: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          requiredUserId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
        }),
        response: { 201: PolicySlotShape, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { policyId } = request.params as { policyId: string };
      const { label, ordinal, requiredActorType, requiredUserId } = request.body as {
        label: string;
        ordinal?: number;
        requiredActorType?: string | null;
        requiredUserId?: string | null;
      };

      const existing = await loadPolicy(request.org.id, policyId);
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Policy not found" } });
      }

      const maxOrdinal = await prisma.signoffPolicySlot.aggregate({
        where: { policyId },
        _max: { ordinal: true },
      });
      const nextOrdinal = ordinal ?? (maxOrdinal._max.ordinal ?? 0) + 1;

      const slot = await prisma.signoffPolicySlot.create({
        data: {
          policyId,
          label,
          ordinal: nextOrdinal,
          requiredActorType: requiredActorType || null,
          requiredUserId: requiredUserId || null,
        },
      });
      return reply.status(201).send(slot);
    }
  );

  // DELETE /api/v1/signoff-policies/:policyId/slots/:sid
  fastify.delete(
    "/api/v1/signoff-policies/:policyId/slots/:sid",
    {
      schema: {
        summary: "Remove a slot from a sign-off policy",
        tags: ["signoff-policies"],
        params: SlotParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { policyId, sid } = request.params as { policyId: string; sid: string };

      const existing = await loadPolicy(request.org.id, policyId);
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Policy not found" } });
      }

      await prisma.signoffPolicySlot.delete({ where: { id: sid } });
      return reply.status(204).send();
    }
  );

  // PUT /api/v1/signoff-policies/defaults/org — set org-level default
  fastify.put(
    "/api/v1/signoff-policies/defaults/org",
    {
      schema: {
        summary: "Set the org-level default sign-off policy",
        tags: ["signoff-policies"],
        body: Type.Object({
          policyId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
        }),
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { policyId } = request.body as { policyId: string | null };

      if (policyId !== null) {
        const policy = await loadPolicy(request.org.id, policyId);
        if (!policy) {
          return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Policy not found" } });
        }
      }

      await prisma.appSetting.upsert({
        where: { orgId: request.org.id },
        create: { orgId: request.org.id, defaultSignoffPolicyId: policyId },
        update: { defaultSignoffPolicyId: policyId },
      });
      return reply.status(204).send();
    }
  );

  // PUT /api/v1/signoff-policies/defaults/projects/:projectId — set project-level default
  fastify.put(
    "/api/v1/signoff-policies/defaults/projects/:projectId",
    {
      schema: {
        summary: "Set the project-level default sign-off policy",
        tags: ["signoff-policies"],
        params: Type.Object({ projectId: Type.String({ format: "uuid" }) }),
        body: Type.Object({
          policyId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
        }),
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { projectId } = request.params as { projectId: string };
      const { policyId } = request.body as { policyId: string | null };

      const project = await prisma.project.findFirst({ where: { id: projectId, orgId: request.org.id } });
      if (!project) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Project not found" } });
      }

      if (policyId !== null) {
        const policy = await loadPolicy(request.org.id, policyId);
        if (!policy) {
          return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Policy not found" } });
        }
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { defaultSignoffPolicyId: policyId },
      });
      return reply.status(204).send();
    }
  );

  // PUT /api/v1/signoff-policies/defaults/tasks/:taskId — set task-level default
  fastify.put(
    "/api/v1/signoff-policies/defaults/tasks/:taskId",
    {
      schema: {
        summary: "Set the task-level default sign-off policy",
        tags: ["signoff-policies"],
        params: Type.Object({ taskId: Type.String({ format: "uuid" }) }),
        body: Type.Object({
          policyId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
        }),
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;
      const { taskId } = request.params as { taskId: string };
      const { policyId } = request.body as { policyId: string | null };

      const task = await prisma.task.findFirst({ where: { id: taskId } });
      if (!task) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Task not found" } });
      }

      if (policyId !== null) {
        const policy = await loadPolicy(request.org.id, policyId);
        if (!policy) {
          return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Policy not found" } });
        }
      }

      await prisma.task.update({ where: { id: taskId }, data: { defaultSignoffPolicyId: policyId } });
      return reply.status(204).send();
    }
  );
}
