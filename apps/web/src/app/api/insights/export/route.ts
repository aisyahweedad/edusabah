import { cookies } from "next/headers";
import { loadEnv } from "@k-aecs/config";
import { SESSION_COOKIE } from "@/lib/constants";

export async function POST(request: Request): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return Response.json({ message: "Authentication required" }, { status: 401 });
  }
  const base = loadEnv().PUBLIC_API_URL.replace(/\/+$/, "");
  const body = await request.text();
  const res = await fetch(`${base}/api/v1/insights/export`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const payload = await res.text();
    return new Response(payload, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  }
  const buffer = await res.arrayBuffer();
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition": res.headers.get("content-disposition") ?? "attachment",
    },
  });
}
