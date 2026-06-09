import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { enforceScope } from "../services/permission.service.js";
import { CommonErrorResponses } from "./_schemas.js";
import { fileContentDisposition } from "../lib/content-disposition.js";

const FileMeta = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    filename: Type.String(),
    mimeType: Type.String(),
    size: Type.Number(),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const TaskFileParams = Type.Object({
  id: Type.String({ format: "uuid" }),
});

const TaskFileDeleteParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  fileId: Type.String({ format: "uuid" }),
});

const FileParams = Type.Object({
  fileId: Type.String({ format: "uuid" }),
});

async function readFileBuffer(file: any) {
  const chunks: Buffer[] = [];
  for await (const chunk of file.file) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function taskFileRoutes(fastify: FastifyInstance) {
  // POST /api/v1/tasks/:id/files
  fastify.post(
    "/api/v1/tasks/:id/files",
    {
      schema: {
        summary: "Attach a file to a task",
        tags: ["tasks"],
        params: TaskFileParams,
        response: { 201: FileMeta, ...CommonErrorResponses },
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

      const data = await readFileBuffer(file);

      const created = await prisma.file.create({
        data: {
          filename: file.filename,
          mimeType: file.mimetype,
          size: data.length,
          data,
          uploadedBy: request.user.id,
          taskFiles: { create: { taskId: id } },
        },
        select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
      });

      return reply.status(201).send({ ...created, createdAt: created.createdAt.toISOString() });
    }
  );

  // DELETE /api/v1/tasks/:id/files/:fileId
  fastify.delete(
    "/api/v1/tasks/:id/files/:fileId",
    {
      schema: {
        summary: "Remove a file attachment from a task",
        tags: ["tasks"],
        params: TaskFileDeleteParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;

      const { id, fileId } = request.params as { id: string; fileId: string };

      const join = await prisma.taskFile.findUnique({
        where: { taskId_fileId: { taskId: id, fileId } },
      });
      if (!join) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "File attachment not found" } });
      }

      await prisma.taskFile.delete({ where: { taskId_fileId: { taskId: id, fileId } } });
      await prisma.file.delete({ where: { id: fileId } });

      return reply.status(204).send();
    }
  );

  // GET /api/v1/files/:fileId
  fastify.get(
    "/api/v1/files/:fileId",
    {
      schema: {
        summary: "Download a file by ID",
        tags: ["tasks"],
        params: FileParams,
        response: { ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;

      const { fileId } = request.params as { fileId: string };

      const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: { data: true, mimeType: true, filename: true },
      });
      if (!file) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "File not found" } });
      }

      return reply
        .header("Content-Type", file.mimeType)
        .header("Content-Disposition", fileContentDisposition(file.filename, "attachment"))
        .header("Cache-Control", "private, max-age=31536000, immutable")
        .send(file.data);
    }
  );
}
