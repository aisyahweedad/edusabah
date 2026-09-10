import type { SessionClaims } from "@k-aecs/auth";

declare module "fastify" {
  interface FastifyRequest {
    /** Decoded officer session, set by the auth preHandler when a token is present. */
    officerSession?: SessionClaims;
  }
}
