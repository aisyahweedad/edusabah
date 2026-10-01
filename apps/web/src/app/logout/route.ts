import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);

  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");

  const response = NextResponse.redirect(`${proto}://${host}/login`);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
