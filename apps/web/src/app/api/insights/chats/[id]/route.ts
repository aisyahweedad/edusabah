import { cookies } from "next/headers";
import { loadEnv } from "@k-aecs/config";
import { SESSION_COOKIE } from "@/lib/constants";

async function proxy(
  method: "GET" | "DELETE",
  id: string,
): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return Response.json({ message: "Authentication required" }, { status: 401 });
  }
  const base = loadEnv().PUBLIC_API_URL.replace(/\/+$/, "");
  const res = await fetch(
    `${base}/api/v1/insights/chats/${encodeURIComponent(decodeURIComponent(id))}`,
    {
      method,
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = await res.text();
  return new Response(payload, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxy("GET", id);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxy("DELETE", id);
}
