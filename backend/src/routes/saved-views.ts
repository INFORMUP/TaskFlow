import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma-client.js";
import { enforceScope } from "../services/permission.service.js";
import { CommonErrorResponses, IdParams } from "./_schemas.js";

const SavedViewRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    filters: Type.Unknown(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const CreateBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  filters: Type.Record(Type.String(), Type.Unknown()),
});

const UpdateBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  filters: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

function format(view: { id: string; name: string; filters: unknown; createdAt: Date; updatedAt: Date }) {
  return {
    id: view.id,
    name: view.name,
    filters: view.filters,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

export async function savedViewRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: Static<typeof CreateBody> }>(
    "/api/v1/saved-views",
    {
      schema: {
        summary: "Create a saved view",
        description: "Per-user saved filter set. Requires tasks:read scope.",
        tags: ["saved-views"],
        body: CreateBody,
        response: { 201: SavedViewRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { name, filters } = request.body;

      try {
        const view = await prisma.savedView.create({
          data: {
            orgId: request.org.id,
            userId: request.user.id,
            name,
            filters: filters as Prisma.InputJsonValue,
          },
        });
        return reply.status(201).send(format(view));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.status(400).send({
            error: { code: "DUPLICATE_NAME", message: "A saved view with this name already exists" },
          });
        }
        throw err;
      }
    }
  );

  fastify.get(
    "/api/v1/saved-views",
    {
      schema: {
        summary: "List the caller's saved views",
        tags: ["saved-views"],
        response: {
          200: Type.Object(
            { data: Type.Array(SavedViewRecord) },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const views = await prisma.savedView.findMany({
        where: { userId: request.user.id, orgId: request.org.id },
        orderBy: { createdAt: "asc" },
      });
      return { data: views.map(format) };
    }
  );

  fastify.patch<{ Params: { id: string }; Body: Static<typeof UpdateBody> }>(
    "/api/v1/saved-views/:id",
    {
      schema: {
        summary: "Update a saved view (owner only)",
        tags: ["saved-views"],
        params: IdParams,
        body: UpdateBody,
        response: { 200: SavedViewRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { id } = request.params;
      const updates = request.body;

      const existing = await prisma.savedView.findFirst({
        where: { id, userId: request.user.id, orgId: request.org.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Saved view not found" } });
      }

      try {
        const view = await prisma.savedView.update({
          where: { id },
          data: {
            ...(updates.name !== undefined && { name: updates.name }),
            ...(updates.filters !== undefined && { filters: updates.filters as Prisma.InputJsonValue }),
          },
        });
        return reply.send(format(view));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.status(400).send({
            error: { code: "DUPLICATE_NAME", message: "A saved view with this name already exists" },
          });
        }
        throw err;
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/v1/saved-views/:id",
    {
      schema: {
        summary: "Delete a saved view (owner only)",
        tags: ["saved-views"],
        params: IdParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { id } = request.params;

      const existing = await prisma.savedView.findFirst({
        where: { id, userId: request.user.id, orgId: request.org.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Saved view not found" } });
      }

      await prisma.savedView.delete({ where: { id } });
      return reply.status(204).send();
    }
  );
}
