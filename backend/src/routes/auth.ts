import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/api/v1/auth/refresh", async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string };

    if (!refreshToken) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Refresh token required" },
      });
    }

    try {
      const payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as jwt.JwtPayload;

      if (payload.type !== "refresh") {
        return reply.status(401).send({
          error: { code: "UNAUTHORIZED", message: "Invalid token type" },
        });
      }

      const accessToken = jwt.sign(
        { sub: payload.sub, type: "access" },
        config.jwtSecret,
        { expiresIn: config.jwtAccessExpiresIn }
      );

      return { accessToken };
    } catch {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or expired refresh token" },
      });
    }
  });
}
