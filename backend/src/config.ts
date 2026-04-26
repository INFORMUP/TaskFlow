import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const isProduction = process.env.NODE_ENV === "production";

function requireSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`${name} must be set in production`);
  }
  return devFallback;
}

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: requireSecret("JWT_SECRET", "dev-jwt-secret"),
  jwtRefreshSecret: requireSecret("JWT_REFRESH_SECRET", "dev-jwt-refresh-secret"),
  tokenHashSecret: requireSecret("TOKEN_HASH_SECRET", "dev-token-hash-secret"),
  jwtAccessExpiresIn: "1h",
  jwtRefreshExpiresIn: "7d",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  corsOrigins: (process.env.CORS_ALLOW_ORIGINS || "http://localhost:5173,http://localhost:5174").split(","),
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "TaskFlow <no-reply@taskflow.local>",
  inviteAcceptBaseUrl: process.env.INVITE_ACCEPT_BASE_URL ?? "http://localhost:5173/accept-invite",
  // In-app feedback bubble routes submissions to a designated TaskFlow product
  // project. When productProjectOrgId is unset, feedback is stored without
  // creating a task (legacy behavior). Read lazily so tests can mutate
  // process.env without reaching into module state.
  get productProjectKey(): string {
    return process.env.TASKFLOW_PRODUCT_PROJECT_KEY ?? "TF";
  },
  get productProjectOrgId(): string {
    return process.env.TASKFLOW_PRODUCT_PROJECT_ORG_ID ?? "";
  },
  get githubWebhookSecret(): string {
    return process.env.GITHUB_WEBHOOK_SECRET ?? "";
  },
};
