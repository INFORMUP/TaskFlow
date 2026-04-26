import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import {
  canManageLabels,
  enforceScope,
  type OrgRole,
} from "../services/permission.service.js";
import {
  createLabel,
  deleteLabel,
  LabelServiceError,
  listLabels,
  updateLabel,
} from "../services/label.service.js";
import { CommonErrorResponses, ErrorResponse, IdParams } from "./_schemas.js";

const LabelRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    color: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true },
);

const CreateBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  color: Type.String({ minLength: 7, maxLength: 7, description: "Hex color #RRGGBB" }),
});

const UpdateBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  color: Type.Optional(Type.String({ minLength: 7, maxLength: 7 })),
});

function ensureManage(request: { user: { teams: { slug: string }[] }; org: { role?: string } }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }): boolean {
  const teamSlugs = request.user.teams.map((t) => t.slug);
  const orgRole = request.org.role as OrgRole | undefined;
  if (canManageLabels(teamSlugs, orgRole)) return true;
  reply.status(403).send({
    error: { code: "FORBIDDEN", message: "You do not have permission to manage labels" },
  });
  return false;
}

function sendError(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, err: unknown): unknown {
  if (err instanceof LabelServiceError) {
    return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
  }
  throw err;
}

export async function labelRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/labels",
    {
      schema: {
        summary: "List labels in the caller's org",
        description: "Requires tasks:read scope.",
        tags: ["labels"],
        response: {
          200: Type.Object({ data: Type.Array(LabelRecord) }, { additionalProperties: true }),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const data = await listLabels(request.org.id);
      return { data };
    },
  );

  fastify.post<{ Body: Static<typeof CreateBody> }>(
    "/api/v1/labels",
    {
      schema: {
        summary: "Create a label",
        description: "Requires tasks:write scope and label-management permission.",
        tags: ["labels"],
        body: CreateBody,
        response: { 201: LabelRecord, 409: ErrorResponse, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      if (!ensureManage(request, reply)) return;
      try {
        const label = await createLabel(request.org.id, request.body.name, request.body.color);
        return reply.status(201).send(label);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: Static<typeof UpdateBody> }>(
    "/api/v1/labels/:id",
    {
      schema: {
        summary: "Update a label",
        description: "Requires tasks:write scope and label-management permission.",
        tags: ["labels"],
        params: IdParams,
        body: UpdateBody,
        response: { 200: LabelRecord, 409: ErrorResponse, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      if (!ensureManage(request, reply)) return;
      try {
        const label = await updateLabel(request.org.id, request.params.id, request.body);
        return reply.send(label);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/v1/labels/:id",
    {
      schema: {
        summary: "Delete a label",
        description: "Requires tasks:write scope and label-management permission.",
        tags: ["labels"],
        params: IdParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      if (!ensureManage(request, reply)) return;
      try {
        await deleteLabel(request.org.id, request.params.id);
        return reply.status(204).send();
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
