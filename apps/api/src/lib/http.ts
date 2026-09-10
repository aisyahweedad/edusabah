import type { FastifyReply } from "fastify";
import { ZodError } from "zod";
import { AuthError } from "@k-aecs/auth";

/** Uniform error serializer used by the API error handler. */
export function serializeError(error: unknown): { statusCode: number; body: unknown } {
  if (error instanceof AuthError) {
    return { statusCode: error.details.statusCode, body: { error: error.details.code, message: error.message } };
  }
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: "VALIDATION",
        message: "Request failed validation",
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { statusCode: 500, body: { error: "INTERNAL", message } };
}

export function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  const { statusCode, body } = serializeError(error);
  return reply.code(statusCode).send(body);
}
