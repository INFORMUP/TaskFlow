export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string;
  actorType: string;
  teams: { id: string; slug: string }[];
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser;
  }
}
