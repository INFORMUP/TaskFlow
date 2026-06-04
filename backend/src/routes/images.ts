import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { enforceScope } from "../services/permission.service.js";
import { CommonErrorResponses } from "./_schemas.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const RequirementImageParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  rid: Type.String({ format: "uuid" }),
});

const ImageParams = Type.Object({
  imageId: Type.String({ format: "uuid" }),
});

const RequirementImageDeleteParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  rid: Type.String({ format: "uuid" }),
  imageId: Type.String({ format: "uuid" }),
});

export async function imageRoutes(fastify: FastifyInstance) {
  // POST /api/v1/tasks/:id/requirements/:rid/images
  fastify.post(
    "/api/v1/tasks/:id/requirements/:rid/images",
    {
      schema: {
        summary: "Attach an image to a requirement",
        tags: ["requirements"],
        params: RequirementImageParams,
        response: {
          201: Type.Object(
            {
              id: Type.String({ format: "uuid" }),
              filename: Type.String(),
              mimeType: Type.String(),
              size: Type.Number(),
              createdAt: Type.String({ format: "date-time" }),
            },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;

      const { rid } = request.params as { id: string; rid: string };

      const req = await prisma.requirement.findFirst({
        where: { id: rid, isDeleted: false },
        select: { id: true },
      });
      if (!req) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Requirement not found" } });
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

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      const image = await prisma.image.create({
        data: {
          requirementId: rid,
          filename: file.filename,
          mimeType,
          size: data.length,
          data,
          uploadedBy: request.user.id,
        },
        select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
      });

      return reply.status(201).send(image);
    }
  );

  // GET /api/v1/images/:imageId  — serve the binary with proper content-type
  fastify.get(
    "/api/v1/images/:imageId",
    {
      schema: {
        summary: "Download an image by ID",
        tags: ["requirements"],
        params: ImageParams,
        response: { ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;

      const { imageId } = request.params as { imageId: string };

      const image = await prisma.image.findUnique({
        where: { id: imageId },
        select: { data: true, mimeType: true, filename: true },
      });
      if (!image) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Image not found" } });
      }

      return reply
        .header("Content-Type", image.mimeType)
        .header("Content-Disposition", `inline; filename="${image.filename}"`)
        .header("Cache-Control", "private, max-age=31536000, immutable")
        .send(image.data);
    }
  );

  // DELETE /api/v1/tasks/:id/requirements/:rid/images/:imageId
  fastify.delete(
    "/api/v1/tasks/:id/requirements/:rid/images/:imageId",
    {
      schema: {
        summary: "Remove an image from a requirement",
        tags: ["requirements"],
        params: RequirementImageDeleteParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;

      const { rid, imageId } = request.params as { id: string; rid: string; imageId: string };

      const image = await prisma.image.findFirst({
        where: { id: imageId, requirementId: rid },
        select: { id: true },
      });
      if (!image) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Image not found" } });
      }

      await prisma.image.delete({ where: { id: imageId } });
      return reply.status(204).send();
    }
  );
}
