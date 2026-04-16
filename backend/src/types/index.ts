export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string;
  actorType: string;
  teams: { id: string; slug: string }[];
  // null for JWT-authenticated sessions (no scope gating);
  // array of scope keys for API-token-authenticated requests.
  scopes: string[] | null;
  // Present only for API-token auth — used to enforce "token can't manage tokens".
  apiTokenId: string | null;
  // True when the API token is flagged as an integration token (used for rate limit tiering).
  integrationToken: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser;
  }
}
