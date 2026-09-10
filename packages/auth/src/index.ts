import { createHash, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@k-aecs/config";
import { hasPermission, ROLES, ROLE_PERMISSIONS, type Permission, type Role } from "@k-aecs/shared";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export type SessionKind = "officer";

export interface SessionClaims {
  /** Officer user id. */
  sub: string;
  kind: SessionKind;
  role: Role;
  /** Hard-coded at login; re-checked against the DB on restricted routes. */
  permissions: Permission[];
  iat?: number;
  exp?: number;
}

export type { Role, Permission };

function secret(): string {
  const value = loadEnv().AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET must be set (>= 16 chars) before issuing sessions");
  }
  return value;
}

export function signSession(payload: Omit<SessionClaims, "iat" | "exp">): string {
  const env = loadEnv();
  return jwt.sign(
    {
      ...payload,
      permissions: ROLES.includes(payload.role)
        ? [...permissionsOf(payload.role)]
        : payload.permissions,
    },
    secret(),
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
}

export function verifySession(token: string): SessionClaims {
  const decoded = jwt.verify(token, secret()) as jwt.JwtPayload &
    Partial<Omit<SessionClaims, "iat" | "exp">>;
  if (decoded.kind !== "officer" || typeof decoded.sub !== "string" || !decoded.role) {
    throw new Error("Invalid session");
  }
  if (!ROLES.includes(decoded.role)) throw new Error("Unknown role in session");
  return {
    sub: decoded.sub,
    kind: decoded.kind,
    role: decoded.role,
    permissions:
      decoded.permissions && decoded.permissions.length
        ? decoded.permissions
        : [...permissionsOf(decoded.role)],
  };
}

export function permissionsOf(role: Role): readonly Permission[] {
  return (ROLE_PERMISSIONS as Record<Role, readonly Permission[]>)[role];
}

export function can(role: Role, permission: Permission): boolean {
  return hasPermission(role, permission);
}

/** Extract a bearer token from an Authorization header (undefined if absent). */
export function bearerFromHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

export interface AuthErrorDetails {
  statusCode: 401 | 403;
  code: "UNAUTHORIZED" | "INVALID_TOKEN" | "FORBIDDEN";
  message: string;
}

export class AuthError extends Error {
  readonly details: AuthErrorDetails;
  constructor(details: AuthErrorDetails) {
    super(details.message);
    this.name = "AuthError";
    this.details = details;
  }
}

/* ------------------------------ passwords ------------------------------ */

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Deterministic masking for display: "a***c". Keeps a stable prefix/suffix so
 * support calls can compare against a stored fragment without full account names.
 */
export function maskName(value: string): string {
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value[0]}${"*".repeat(value.length - 2)}${value[value.length - 1]}`;
}

/* --------------------- guard helpers for fastify/UI --------------------- */

/**
 * Authorize a decrypted session for `permission`. Throws AuthError(403) when
 * the role lacks the permission and AuthError(401) when no session is given.
 */
export function requirePermission(session: SessionClaims | undefined, permission: Permission): SessionClaims {
  if (!session) {
    throw new AuthError({
      statusCode: 401,
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  if (!hasPermission(session.role, permission)) {
    throw new AuthError({
      statusCode: 403,
      code: "FORBIDDEN",
      message: `Role ${session.role} lacks ${permission}`,
    });
  }
  return session;
}

/* ------------------------- password normalization ------------------------ */

function normalize(s: string): string {
  return s.trim();
}

/** Compare two normalized strings in constant time (used for HMAC-style checks). */
export function constantTimeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(normalize(a)).digest();
  const hashB = createHash("sha256").update(normalize(b)).digest();
  return timingSafeEqual(hashA, hashB);
}
