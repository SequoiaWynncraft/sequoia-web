import { env } from "$env/dynamic/private";

const DEFAULT_BACKEND_URL = "http://localhost:8080";

export function sequoiaWebBackendUrl(path: string): string {
  const baseUrl = (env.SEQUOIA_WEB_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function proxySequoiaWebBackend(
  fetchImpl: typeof fetch,
  request: Request,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("accept", headers.get("accept") ?? "application/json");

  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  let response: Response;
  try {
    response = await fetchImpl(sequoiaWebBackendUrl(path), {
      ...init,
      headers,
    });
  } catch {
    return Response.json({ error: "Sequoia web backend is unavailable." }, { status: 503 });
  }

  const body = responseAllowsBody(response.status) ? await response.arrayBuffer() : null;
  const proxiedHeaders = new Headers();
  const contentType = response.headers.get("content-type");
  const setCookie = response.headers.get("set-cookie");

  if (contentType) proxiedHeaders.set("content-type", contentType);
  if (setCookie) proxiedHeaders.set("set-cookie", setCookie);

  return new Response(body, {
    status: response.status,
    headers: proxiedHeaders,
  });
}

function responseAllowsBody(status: number): boolean {
  return status !== 204 && status !== 205 && status !== 304;
}
