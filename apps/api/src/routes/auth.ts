import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { hashPassword, signSession, verifyPassword } from "@k-aecs/auth";
import { getDb } from "@k-aecs/database";
import { officers } from "@k-aecs/database/schema";
import { loginSchema, officerCreateSchema } from "@k-aecs/validation";
import { authenticate, authorize, resolveSession } from "../lib/auth.js";
import { sendError } from "../lib/http.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", resolveSession);

  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, parsed.error);
    }
    const { email, password } = parsed.data;
    const db = getDb();
    const [officer] = await db
      .select()
      .from(officers)
      .where(eq(officers.email, email.toLowerCase()))
      .limit(1);

    if (!officer || !(await verifyPassword(password, officer.passwordHash))) {
      return reply.code(401).send({
        error: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }
    if (!officer.isActive) {
      return reply.code(403).send({ error: "ACCOUNT_DISABLED", message: "Account is disabled" });
    }

    const token = signSession({
      sub: officer.id,
      kind: "officer",
      role: officer.role as Parameters<typeof signSession>[0]["role"],
      permissions: [],
    });

    await db
      .update(officers)
      .set({ lastLoginAt: new Date() })
      .where(eq(officers.id, officer.id));

    return {
      token,
      officer: { ...officer, passwordHash: undefined },
    };
  });

  app.get("/me", { preHandler: authenticate }, async (request) => {
    const db = getDb();
    const [officer] = await db
      .select()
      .from(officers)
      .where(eq(officers.id, request.officerSession!.sub))
      .limit(1);
    return {
      session: request.officerSession,
      officer: officer ? { ...officer, passwordHash: undefined } : undefined,
    };
  });

  app.post(
    "/officers",
    { preHandler: [authorize("users:manage")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = officerCreateSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, parsed.error);
      const { email, password, name, role } = parsed.data;
      const db = getDb();
      const passwordHash = await hashPassword(password);
      const [created] = await db
        .insert(officers)
        .values({
          email: email.toLowerCase(),
          name,
          role,
          passwordHash,
          createdBy: request.officerSession!.sub,
        })
        .returning();
      return reply.code(201).send({ officer: { ...created, passwordHash: undefined } });
    },
  );

  app.get(
    "/officers",
    { preHandler: [authorize("users:manage")] },
    async () => {
      const db = getDb();
      const rows = await db
        .select({ id: officers.id, email: officers.email, name: officers.name, role: officers.role, isActive: officers.isActive, lastLoginAt: officers.lastLoginAt, createdAt: officers.createdAt })
        .from(officers)
        .orderBy(officers.createdAt);
      return { officers: rows };
    },
  );
}
