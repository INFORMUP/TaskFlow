import { FastifyInstance } from "fastify";
import { prisma } from "../prisma-client.js";
import { canPerformAction } from "../services/permission.service.js";

export async function commentRoutes(fastify: FastifyInstance) {
  // Create comment
  fastify.post("/api/v1/tasks/:id/comments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { body } = request.body as { body?: string };

    if (!body || !body.trim()) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "Comment body is required" },
      });
    }

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
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    });
  });

  // List comments
  fastify.get("/api/v1/tasks/:id/comments", async (request, reply) => {
    const { id } = request.params as { id: string };

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
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    };
  });

  // Edit comment (own only)
  fastify.patch("/api/v1/tasks/:id/comments/:commentId", async (request, reply) => {
    const { commentId } = request.params as { id: string; commentId: string };
    const { body } = request.body as { body?: string };

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
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  });

  // Delete comment (soft, own only or with delete permission)
  fastify.delete("/api/v1/tasks/:id/comments/:commentId", async (request, reply) => {
    const { id, commentId } = request.params as { id: string; commentId: string };

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, isDeleted: false },
    });

    if (!comment) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Comment not found" },
      });
    }

    // Can delete own comment, or if user has delete permission on the task's flow
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

    return { success: true };
  });
}
