import Fastify from "fastify";
import cors from "@fastify/cors";
import { errorHandler } from "./plugins/error-handler.js";
import { authPlugin } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { taskRoutes } from "./routes/tasks.js";
import { transitionRoutes } from "./routes/transitions.js";
import { assignmentRoutes } from "./routes/assignments.js";
import { commentRoutes } from "./routes/comments.js";
import { teamRoutes } from "./routes/teams.js";
import { projectRoutes } from "./routes/projects.js";
import { config } from "./config.js";
import "./types/index.js";

export function createApp() {
  const app = Fastify({ logger: false });

  app.register(cors, { origin: config.corsOrigins });
  app.register(errorHandler);
  app.register(authPlugin);
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(userRoutes);
  app.register(taskRoutes);
  app.register(transitionRoutes);
  app.register(assignmentRoutes);
  app.register(commentRoutes);
  app.register(teamRoutes);
  app.register(projectRoutes);

  return app;
}
