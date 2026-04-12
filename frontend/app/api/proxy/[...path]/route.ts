import { NextRequest, NextResponse } from "next/server";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REQUEST_HEADERS_TO_FORWARD = ["authorization", "content-type", "accept"];
const RESPONSE_HEADERS_TO_FORWARD = [
  "content-type",
  "content-disposition",
  "cache-control",
  "etag",
  "last-modified",
];

function resolveBackendBase() {
  const configured =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    "http://127.0.0.1:8000/api";
  return configured.replace(/\/$/, "");
}

async function handleProxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const segments = Array.isArray(params.path) ? params.path : [];
  const encodedPath = segments.map((segment) => encodeURIComponent(segment)).join("/");
  const backendBase = resolveBackendBase();
  const targetUrl = `${backendBase}/${encodedPath}${request.nextUrl.search}`;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS_TO_FORWARD) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  if (METHODS_WITH_BODY.has(request.method.toUpperCase())) {
    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > 0) {
      init.body = rawBody;
    }
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(targetUrl, init);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown network error";
    return NextResponse.json(
      { detail: `Proxy could not reach backend at ${backendBase}. ${reason}` },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS_TO_FORWARD) {
    const value = upstreamResponse.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }

  const hasBody = ![204, 304].includes(upstreamResponse.status) && request.method.toUpperCase() !== "HEAD";
  const responseBody = hasBody ? await upstreamResponse.arrayBuffer() : null;

  return new NextResponse(responseBody, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, context);
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, context);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, context);
}
