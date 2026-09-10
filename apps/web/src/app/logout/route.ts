import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return Response.redirect(new URL("/login", request.url), 302);
}
