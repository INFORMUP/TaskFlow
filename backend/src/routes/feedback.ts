import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { CommonErrorResponses, ErrorResponse, IdParams } from "./_schemas.js";
import { config } from "../config.js";
import { createTask, TaskServiceError } from "../services/task.service.js";
import {
  FEEDBACK_BOT_DISPLAY_NAME,
  FEEDBACK_BOT_USER_ID,
} from "../constants/system-users.js";

const FeedbackType = Type.Union([
  Type.Literal("BUG"),
  Type.Literal("FEATURE"),
  Type.Literal("IMPROVEMENT"),
]);

const FEEDBACK_TYPE_TO_FLOW_SLUG: Record<string, string> = {
  BUG: "bug",
  FEATURE: "feature",
  IMPROVEMENT: "improvement",
};

const TASK_LINK_STATUSES = [
  "pending",
  "linked",
  "skipped_no_config",
  "skipped_no_project",
  "skipped_no_flow",
  "failed_create",
  "failed_link",
] as const;
type TaskLinkStatus = (typeof TASK_LINK_STATUSES)[number];

const TaskLinkStatusSchema = Type.Union(
  TASK_LINK_STATUSES.map((s) => Type.Literal(s)),
);

const ERROR_MAX_LEN = 1000;
function truncateError(message: string): string {
  if (message.length <= ERROR_MAX_LEN) return message;
  return message.slice(0, ERROR_MAX_LEN - 1) + "…";
}

function truncateTitle(message: string, max = 80): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1).trimEnd() + "…";
}

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
    taskId: Type.Union([Type.String(), Type.Null()]),
    taskLinkStatus: TaskLinkStatusSchema,
    taskLinkError: Type.Union([Type.String(), Type.Null()]),
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
  taskLinkStatus: Type.Optional(TaskLinkStatusSchema),
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

interface AttemptInput {
  feedbackType: "BUG" | "FEATURE" | "IMPROVEMENT";
  message: string;
  page: string | null;
  log: FastifyRequest["log"];
}

let feedbackBotEnsured: Promise<void> | null = null;
function ensureFeedbackBotUser(): Promise<void> {
  if (!feedbackBotEnsured) {
    feedbackBotEnsured = prisma.user
      .upsert({
        where: { id: FEEDBACK_BOT_USER_ID },
        update: {},
        create: {
          id: FEEDBACK_BOT_USER_ID,
          email: null,
          displayName: FEEDBACK_BOT_DISPLAY_NAME,
          actorType: "agent",
          status: "active",
        },
      })
      .then(() => undefined)
      .catch((err) => {
        feedbackBotEnsured = null;
        throw err;
      });
  }
  return feedbackBotEnsured;
}

async function createProductTaskOnly(input: AttemptInput): Promise<{
  taskId: string | null;
  status: TaskLinkStatus;
  error: string | null;
}> {
  const { productProjectOrgId, productProjectKey } = config;
  if (!productProjectOrgId) {
    return { taskId: null, status: "skipped_no_config", error: null };
  }

  const project = await prisma.project.findFirst({
    where: { orgId: productProjectOrgId, key: productProjectKey },
    select: { id: true },
  });
  if (!project) {
    input.log.warn(
      { productProjectOrgId, productProjectKey },
      "feedback: product project not found; skipping task creation",
    );
    return { taskId: null, status: "skipped_no_project", error: null };
  }

  const flowSlug = FEEDBACK_TYPE_TO_FLOW_SLUG[input.feedbackType];
  const description =
    `${input.message}\n\n` +
    `---\nSubmitted via in-app feedback bubble.` +
    (input.page ? `\nPage: ${input.page}` : "");

  try {
    await ensureFeedbackBotUser();
    const task = await createTask({
      orgId: productProjectOrgId,
      flowSlug,
      title: truncateTitle(input.message),
      description,
      priority: "medium",
      createdBy: FEEDBACK_BOT_USER_ID,
      actorType: "agent",
      assigneeUserId: null,
      projectIds: [project.id],
    });
    if (!task) {
      input.log.warn(
        { productProjectOrgId, productProjectKey, flowSlug, projectId: project.id },
        "feedback: flow not found in product org; skipping task creation",
      );
      return { taskId: null, status: "skipped_no_flow", error: null };
    }
    return { taskId: task.id, status: "linked", error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Flow exists in the org but the product project doesn't have it attached
    // — this is a misconfiguration rather than an unexpected error, so admins
    // see it as a `skipped_no_flow` rather than `failed_create`.
    if (err instanceof TaskServiceError && err.code === "FLOW_NOT_IN_PROJECTS") {
      input.log.warn(
        { flowSlug, projectId: project.id },
        "feedback: flow not attached to product project; skipping task creation",
      );
      return { taskId: null, status: "skipped_no_flow", error: null };
    }
    input.log.error(
      { err, flowSlug, projectId: project.id },
      "feedback: failed to create product task",
    );
    return {
      taskId: null,
      status: "failed_create",
      error: truncateError(message),
    };
  }
}

async function attemptLink(
  feedbackId: string,
  taskId: string,
  log: FastifyRequest["log"],
): Promise<{ status: TaskLinkStatus; error: string | null }> {
  try {
    await prisma.feedback.update({
      where: { id: feedbackId },
      data: { taskId, taskLinkStatus: "linked", taskLinkError: null },
    });
    return { status: "linked", error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      { err, feedbackId, taskId },
      "feedback: created task but failed to link it to feedback row (orphan task)",
    );
    return { status: "failed_link", error: truncateError(message) };
  }
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
      const attempt = await createProductTaskOnly({
        feedbackType: type,
        message: trimmed,
        page: page ?? null,
        log: request.log,
      });

      if (attempt.taskId) {
        const link = await attemptLink(created.id, attempt.taskId, request.log);
        if (link.status === "linked") {
          const updated = await prisma.feedback.findUnique({
            where: { id: created.id },
          });
          return reply.status(201).send(updated);
        }
        const updated = await prisma.feedback.update({
          where: { id: created.id },
          data: { taskLinkStatus: "failed_link", taskLinkError: link.error },
        });
        return reply.status(201).send(updated);
      }

      const updated = await prisma.feedback.update({
        where: { id: created.id },
        data: { taskLinkStatus: attempt.status, taskLinkError: attempt.error },
      });
      return reply.status(201).send(updated);
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
      const taskLinkStatus = request.query.taskLinkStatus;

      const where = {
        orgId: request.org.id,
        archivedAt: archived ? { not: null } : null,
        ...(taskLinkStatus ? { taskLinkStatus } : {}),
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

  fastify.post<{ Params: Static<typeof IdParams> }>(
    "/api/v1/feedback/:id/retry-link",
    {
      schema: {
        summary: "Retry task creation/linking on a failed feedback row (admin)",
        tags: ["feedback"],
        params: IdParams,
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

      if (
        existing.taskLinkStatus !== "failed_create" &&
        existing.taskLinkStatus !== "failed_link"
      ) {
        return reply.status(409).send({
          error: {
            code: "INVALID_STATE",
            message: `Cannot retry from status '${existing.taskLinkStatus}'`,
          },
        });
      }

      if (existing.taskLinkStatus === "failed_link" && existing.taskId) {
        const link = await attemptLink(id, existing.taskId, request.log);
        const updated = await prisma.feedback.update({
          where: { id },
          data: {
            taskLinkStatus: link.status,
            taskLinkError: link.error,
          },
        });
        return updated;
      }

      const attempt = await createProductTaskOnly({
        feedbackType: existing.type as "BUG" | "FEATURE" | "IMPROVEMENT",
        message: existing.message,
        page: existing.page,
        log: request.log,
      });

      if (attempt.taskId) {
        const link = await attemptLink(id, attempt.taskId, request.log);
        if (link.status === "linked") {
          const updated = await prisma.feedback.findUnique({ where: { id } });
          return updated;
        }
        const updated = await prisma.feedback.update({
          where: { id },
          data: {
            taskLinkStatus: "failed_link",
            taskLinkError: link.error,
          },
        });
        return updated;
      }

      const updated = await prisma.feedback.update({
        where: { id },
        data: {
          taskLinkStatus: attempt.status,
          taskLinkError: attempt.error,
        },
      });
      return updated;
    },
  );
}
