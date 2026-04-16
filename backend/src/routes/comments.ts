import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { canPerformAction, enforceScope } from "../services/permission.service.js";
import { CommonErrorResponses, IdParams, UserSummary } from "./_schemas.js";

const CommentRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    body: Type.String(),
    author: UserSummary,
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const CreateCommentBody = Type.Object({
  body: Type.String({ minLength: 1 }),
});

const UpdateCommentBody = Type.Object({
  body: Type.Optional(Type.String({ minLength: 1 })),
});

const CommentParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  commentId: Type.String({ format: "uuid" }),
});

export async function commentRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string }; Body: Static<typeof CreateCommentBody> }>(
    "/api/v1/tasks/:id/comments",
    {
      schema: {
        summary: "Add a comment to a task",
        description: "Requires comments:write scope and `comment` permission for the task's flow.",
        tags: ["comments"],
        params: IdParams,
        body: CreateCommentBody,
        response: { 201: CommentRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "comments:write")) return;
      const { id } = request.params;
      const { body } = request.body;

      const task = await prisma.task.findFirst({
        where: { id, isDeleted: false },
        include: { flow: true },
      });

      if (!task) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Task not found" },
        });
      }

      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!canPerformAction(teamSlugs, "comment", task.flow.slug)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You do not have permission to comment" },
        });
      }

      const comment = await prisma.comment.create({
        data: {
          taskId: id,
          authorId: request.user.id,
          body,
        },
        include: {
          author: { select: { id: true, displayName: true, actorType: true } },
        },
      });

      return reply.status(201).send({
        id: comment.id,
        body: comment.body,
        author: comment.author,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
      });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/tasks/:id/comments",
    {
      schema: {
        summary: "List a task's comments",
        description: "Requires tasks:read scope. Returns visible (non-deleted) comments in creation order.",
        tags: ["comments"],
        params: IdParams,
        response: {
          200: Type.Object(
            { data: Type.Array(CommentRecord) },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { id } = request.params;

      const task = await prisma.task.findFirst({
        where: { id, isDeleted: false },
      });

      if (!task) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Task not found" },
        });
      }

      const comments = await prisma.comment.findMany({
        where: { taskId: id, isDeleted: false },
        include: {
          author: { select: { id: true, displayName: true, actorType: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      return {
        data: comments.map((c) => ({
          id: c.id,
          body: c.body,
          author: c.author,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
      };
    }
  );

  fastify.patch<{ Params: Static<typeof CommentParams>; Body: Static<typeof UpdateCommentBody> }>(
    "/api/v1/tasks/:id/comments/:commentId",
    {
      schema: {
        summary: "Edit a comment",
        description: "Only the comment's author can edit it.",
        tags: ["comments"],
        params: CommentParams,
        body: UpdateCommentBody,
        response: { 200: CommentRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "comments:write")) return;
      const { commentId } = request.params;
      const { body } = request.body;

      const comment = await prisma.comment.findFirst({
        where: { id: commentId, isDeleted: false },
      });

      if (!comment) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Comment not found" },
        });
      }

      if (comment.authorId !== request.user.id) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You can only edit your own comments" },
        });
      }

      const updated = await prisma.comment.update({
        where: { id: commentId },
        data: { body: body ?? comment.body },
        include: {
          author: { select: { id: true, displayName: true, actorType: true } },
        },
      });

      return {
        id: updated.id,
        body: updated.body,
        author: updated.author,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }
  );

  fastify.delete<{ Params: Static<typeof CommentParams> }>(
    "/api/v1/tasks/:id/comments/:commentId",
    {
      schema: {
        summary: "Delete a comment (soft)",
        description:
          "Sets isDeleted on the comment. Users can delete their own comments; users with `delete` permission on the task's flow can delete anyone's.",
        tags: ["comments"],
        params: CommentParams,
        response: {
          200: Type.Object({ success: Type.Literal(true) }, { additionalProperties: true }),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "comments:write")) return;
      const { id, commentId } = request.params;

      const comment = await prisma.comment.findFirst({
        where: { id: commentId, isDeleted: false },
      });

      if (!comment) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Comment not found" },
        });
      }

      if (comment.authorId !== request.user.id) {
        const task = await prisma.task.findFirst({
          where: { id, isDeleted: false },
          include: { flow: true },
        });
        const teamSlugs = request.user.teams.map((t) => t.slug);
        if (!task || !canPerformAction(teamSlugs, "delete", task.flow.slug)) {
          return reply.status(403).send({
            error: { code: "FORBIDDEN", message: "You can only delete your own comments" },
          });
        }
      }

      await prisma.comment.update({
        where: { id: commentId },
        data: { isDeleted: true },
      });

      return { success: true as const };
    }
  );
}
