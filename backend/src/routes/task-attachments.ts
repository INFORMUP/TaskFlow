import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { enforceScope } from "../services/permission.service.js";
import { CommonErrorResponses } from "./_schemas.js";
import { deleteImageIfOrphaned } from "./images.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const ImageMeta = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    filename: Type.String(),
    mimeType: Type.String(),
    size: Type.Number(),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const TaskAttachmentParams = Type.Object({
  id: Type.String({ format: "uuid" }),
});

const TaskAttachmentDeleteParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  imageId: Type.String({ format: "uuid" }),
});

const CommentAttachmentParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  commentId: Type.String({ format: "uuid" }),
});

const CommentAttachmentDeleteParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  commentId: Type.String({ format: "uuid" }),
  imageId: Type.String({ format: "uuid" }),
});

async function readFileBuffer(file: any) {
  const chunks: Buffer[] = [];
  for await (const chunk of file.file) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function taskAttachmentRoutes(fastify: FastifyInstance) {
  // POST /api/v1/tasks/:id/attachments
  fastify.post(
    "/api/v1/tasks/:id/attachments",
    {
      schema: {
        summary: "Attach an image to a task",
        tags: ["tasks"],
        params: TaskAttachmentParams,
        response: { 201: ImageMeta, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;

      const { id } = request.params as { id: string };

      const task = await prisma.task.findFirst({
        where: { id, isDeleted: false, flow: { orgId: request.org.id } },
        select: { id: true },
      });
      if (!task) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Task not found" } });
      }

      const file = await (request as any).file();
      if (!file) {
        return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "No file uploaded" } });
      }

      const mimeType: string = file.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return reply.status(415).send({
          error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Only image files are allowed" },
        });
      }

      const data = await readFileBuffer(file);

      const image = await prisma.image.create({
        data: {
          filename: file.filename,
          mimeType,
          size: data.length,
          data,
          uploadedBy: request.user.id,
          taskImages: { create: { taskId: id } },
        },
        select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
      });

      return reply.status(201).send({ ...image, createdAt: image.createdAt.toISOString() });
    }
  );

  // DELETE /api/v1/tasks/:id/attachments/:imageId
  fastify.delete(
    "/api/v1/tasks/:id/attachments/:imageId",
    {
      schema: {
        summary: "Remove an image attachment from a task",
        tags: ["tasks"],
        params: TaskAttachmentDeleteParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;

      const { id, imageId } = request.params as { id: string; imageId: string };

      const join = await prisma.taskImage.findUnique({
        where: { taskId_imageId: { taskId: id, imageId } },
      });
      if (!join) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Attachment not found" } });
      }

      await prisma.taskImage.delete({ where: { taskId_imageId: { taskId: id, imageId } } });
      await deleteImageIfOrphaned(imageId);

      return reply.status(204).send();
    }
  );

  // POST /api/v1/tasks/:id/comments/:commentId/attachments
  fastify.post(
    "/api/v1/tasks/:id/comments/:commentId/attachments",
    {
      schema: {
        summary: "Attach an image to a comment",
        tags: ["comments"],
        params: CommentAttachmentParams,
        response: { 201: ImageMeta, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "comments:write")) return;

      const { id, commentId } = request.params as { id: string; commentId: string };

      const comment = await prisma.comment.findFirst({
        where: { id: commentId, taskId: id, isDeleted: false, task: { flow: { orgId: request.org.id } } },
        select: { id: true },
      });
      if (!comment) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Comment not found" } });
      }

      const file = await (request as any).file();
      if (!file) {
        return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "No file uploaded" } });
      }

      const mimeType: string = file.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return reply.status(415).send({
          error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Only image files are allowed" },
        });
      }

      const data = await readFileBuffer(file);

      const image = await prisma.image.create({
        data: {
          filename: file.filename,
          mimeType,
          size: data.length,
          data,
          uploadedBy: request.user.id,
          commentImages: { create: { commentId } },
        },
        select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
      });

      return reply.status(201).send({ ...image, createdAt: image.createdAt.toISOString() });
    }
  );

  // DELETE /api/v1/tasks/:id/comments/:commentId/attachments/:imageId
  fastify.delete(
    "/api/v1/tasks/:id/comments/:commentId/attachments/:imageId",
    {
      schema: {
        summary: "Remove an image attachment from a comment",
        tags: ["comments"],
        params: CommentAttachmentDeleteParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "comments:write")) return;

      const { commentId, imageId } = request.params as { id: string; commentId: string; imageId: string };

      const join = await prisma.commentImage.findUnique({
        where: { commentId_imageId: { commentId, imageId } },
      });
      if (!join) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Attachment not found" } });
      }

      await prisma.commentImage.delete({ where: { commentId_imageId: { commentId, imageId } } });
      await deleteImageIfOrphaned(imageId);

      return reply.status(204).send();
    }
  );
}
