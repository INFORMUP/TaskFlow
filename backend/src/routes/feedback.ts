import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { CommonErrorResponses, ErrorResponse, IdParams } from "./_schemas.js";

const FeedbackType = Type.Union([
  Type.Literal("BUG"),
  Type.Literal("ENHANCEMENT"),
]);

const FeedbackRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    orgId: Type.String({ format: "uuid" }),
    userId: Type.String({ format: "uuid" }),
    type: FeedbackType,
    message: Type.String(),
    page: Type.Union([Type.String(), Type.Null()]),
    adminNotes: Type.Union([Type.String(), Type.Null()]),
    archivedAt: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String(),
  },
  { additionalProperties: true },
);

const FeedbackWithUser = Type.Intersect([
  FeedbackRecord,
  Type.Object(
    {
      user: Type.Object(
        {
          displayName: Type.String(),
          email: Type.Union([Type.String(), Type.Null()]),
        },
        { additionalProperties: true },
      ),
    },
    { additionalProperties: true },
  ),
]);

const CreateFeedbackBody = Type.Object({
  type: FeedbackType,
  message: Type.String({ minLength: 1, maxLength: 5000 }),
  page: Type.Optional(Type.String()),
});

const UpdateNotesBody = Type.Object({
  adminNotes: Type.String(),
});

const ArchiveBody = Type.Object({
  archived: Type.Boolean(),
});

const ListQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  archived: Type.Optional(Type.Boolean()),
});

const ListResponse = Type.Object(
  {
    data: Type.Array(FeedbackWithUser),
    total: Type.Integer(),
    page: Type.Integer(),
    limit: Type.Integer(),
  },
  { additionalProperties: true },
);

function isAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!isAdmin(request.org.role)) {
    reply.status(403).send({
      error: { code: "FORBIDDEN", message: "Admin access required" },
    });
    return false;
  }
  return true;
}

function sendNotFound(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: "NOT_FOUND", message: "Feedback not found" },
  });
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function feedbackRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: Static<typeof CreateFeedbackBody> }>(
    "/api/v1/feedback",
    {
      schema: {
        summary: "Submit feedback",
        description: "Any authenticated user can submit bug or enhancement feedback.",
        tags: ["feedback"],
        body: CreateFeedbackBody,
        response: {
          201: FeedbackRecord,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { type, message, page } = request.body;
      const trimmed = message.trim();
      if (trimmed.length === 0) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "message must not be empty",
          },
        });
      }
      const created = await prisma.feedback.create({
        data: {
          orgId: request.org.id,
          userId: request.user.id,
          type,
          message: trimmed,
          page: page ?? null,
        },
      });
      return reply.status(201).send(created);
    },
  );

  fastify.get<{ Querystring: Static<typeof ListQuery> }>(
    "/api/v1/feedback",
    {
      schema: {
        summary: "List feedback (admin)",
        tags: ["feedback"],
        querystring: ListQuery,
        response: {
          200: ListResponse,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const archived = request.query.archived ?? false;

      const where = {
        orgId: request.org.id,
        archivedAt: archived ? { not: null } : null,
      };

      const [rows, total] = await Promise.all([
        prisma.feedback.findMany({
          where,
          include: {
            user: { select: { displayName: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.feedback.count({ where }),
      ]);

      return { data: rows, total, page, limit };
    },
  );

  fastify.get(
    "/api/v1/feedback/export",
    {
      schema: {
        summary: "Export feedback as CSV (admin)",
        tags: ["feedback"],
        response: {
          200: Type.String(),
          401: ErrorResponse,
          403: ErrorResponse,
          429: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      const rows = await prisma.feedback.findMany({
        where: { orgId: request.org.id },
        include: { user: { select: { displayName: true, email: true } } },
        orderBy: { createdAt: "desc" },
      });

      const header = "id,date,user,email,type,message,page,adminNotes,archivedAt";
      const body = rows.map((r) =>
        [
          r.id,
          r.createdAt.toISOString(),
          r.user.displayName,
          r.user.email ?? "",
          r.type,
          r.message,
          r.page ?? "",
          r.adminNotes ?? "",
          r.archivedAt?.toISOString() ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
      const csv = [header, ...body].join("\n");

      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header(
          "content-disposition",
          'attachment; filename="feedback-export.csv"',
        )
        .send(csv);
    },
  );

  fastify.patch<{
    Params: Static<typeof IdParams>;
    Body: Static<typeof UpdateNotesBody>;
  }>(
    "/api/v1/feedback/:id",
    {
      schema: {
        summary: "Update admin notes on a feedback item",
        tags: ["feedback"],
        params: IdParams,
        body: UpdateNotesBody,
        response: {
          200: FeedbackRecord,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      const { id } = request.params;
      const existing = await prisma.feedback.findFirst({
        where: { id, orgId: request.org.id },
      });
      if (!existing) return sendNotFound(reply);

      const updated = await prisma.feedback.update({
        where: { id },
        data: { adminNotes: request.body.adminNotes },
      });
      return updated;
    },
  );

  fastify.patch<{
    Params: Static<typeof IdParams>;
    Body: Static<typeof ArchiveBody>;
  }>(
    "/api/v1/feedback/:id/archive",
    {
      schema: {
        summary: "Archive or unarchive a feedback item",
        tags: ["feedback"],
        params: IdParams,
        body: ArchiveBody,
        response: {
          200: FeedbackRecord,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      const { id } = request.params;
      const existing = await prisma.feedback.findFirst({
        where: { id, orgId: request.org.id },
      });
      if (!existing) return sendNotFound(reply);

      const updated = await prisma.feedback.update({
        where: { id },
        data: { archivedAt: request.body.archived ? new Date() : null },
      });
      return updated;
    },
  );
}
