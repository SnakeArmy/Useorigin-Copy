import { NextRequest } from "next/server";

const BACKEND_CANDIDATES = [
  process.env.USEORIGIN_BACKEND_URL,
  process.env.INTERNAL_API_URL,
  "http://backend:4000",
  "http://localhost:4000",
].filter(Boolean) as string[];

async function forward(request: NextRequest, path: string[]) {
  const search = request.nextUrl.search || "";
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  for (const candidate of BACKEND_CANDIDATES) {
    const url = `${candidate}/api/${path.join("/")}${search}`;

    try {
      const response = await fetch(url, {
        method: request.method,
        headers: {
          "Content-Type": request.headers.get("content-type") || "application/json",
        },
        body,
        cache: "no-store",
      });

      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("content-type") || "application/json",
        },
      });
    } catch {
      continue;
    }
  }

  return Response.json(
    {
      error: "Backend unavailable",
      detail: "The frontend proxy could not reach the finance backend.",
    },
    { status: 502 },
  );
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}
