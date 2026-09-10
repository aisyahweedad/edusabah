import type { FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  bearerFromHeader,
  requirePermission,
  verifySession,
  type Permission,
  type SessionClaims,
} from "@k-aecs/auth";

/** Resolve a Bearer token into `request.officerSession` without rejecting. */
export async function resolveSession(request: FastifyRequest): Promise<void> {
  const token = bearerFromHeader(request.headers.authorization);
  if (!token) return;
  try {
    request.officerSession = verifySession(token);
  } catch (error) {
    request.officerSession = undefined;
  }
}

/** PreHandler that demands a valid Bearer session for the route. */
export function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: (error?: Error) => void,
): void {
  if (!request.officerSession) {
    done(
      new AuthError({
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: "Authentication required",
      }),
    );
    return;
  }
  done();
}

/** PreHandler chain that authenticates then checks `permission` against the role. */
export function authorize(permission: Permission) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    done: (error?: Error) => void,
  ): void => {
    if (!request.officerSession) {
      done(
        new AuthError({
          statusCode: 401,
          code: "UNAUTHORIZED",
          message: "Authentication required",
        }),
      );
      return;
    }
    try {
      requirePermission(request.officerSession, permission);
    } catch (error) {
      done(error as Error);
      return;
    }
    done();
  };
}

export type { SessionClaims };
