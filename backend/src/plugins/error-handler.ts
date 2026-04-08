import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";

export const errorHandler = fp(async function errorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;

    reply.status(statusCode).send({
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message: error.message,
        ...(error.validation && { details: error.validation }),
      },
    });
  });
});
