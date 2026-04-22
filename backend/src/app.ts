import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { errorHandler } from "./plugins/error-handler.js";
import { authPlugin } from "./plugins/auth.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { apiTokenRoutes } from "./routes/api-tokens.js";
import { userRoutes } from "./routes/users.js";
import { taskRoutes } from "./routes/tasks.js";
import { transitionRoutes } from "./routes/transitions.js";
import { assignmentRoutes } from "./routes/assignments.js";
import { commentRoutes } from "./routes/comments.js";
import { teamRoutes } from "./routes/teams.js";
import { projectRoutes } from "./routes/projects.js";
import { flowRoutes } from "./routes/flows.js";
import { organizationRoutes } from "./routes/organizations.js";
import { invitationRoutes } from "./routes/invitations.js";
import { config } from "./config.js";
import "./types/index.js";

export function createApp() {
  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();

  app.register(cors, {
    origin: config.corsOrigins,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.register(errorHandler);
  app.register(authPlugin);
  app.register(rateLimitPlugin);
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "TaskFlow API",
        description:
          "Agent-integrated task management API. Authenticate with a bearer token — either a user JWT or an API token (prefix `tf_`).",
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT | tf_<token>",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });
  app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(apiTokenRoutes);
  app.register(userRoutes);
  app.register(taskRoutes);
  app.register(transitionRoutes);
  app.register(assignmentRoutes);
  app.register(commentRoutes);
  app.register(teamRoutes);
  app.register(projectRoutes);
  app.register(flowRoutes);
  app.register(organizationRoutes);
  app.register(invitationRoutes);

  return app;
}
