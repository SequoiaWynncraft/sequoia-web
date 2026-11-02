import { SEQUOIA_DISCORD_MANAGEMENT_URL } from "$app/env/private";

/** Thin server-only adapter. Rust owns authorization, validation and persistence. */
export async function discordManagement(
  fetchImpl: typeof fetch,
  token: string | undefined,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!token) return Response.json({ error: "Sign in to manage Discord" }, { status: 401 });
  const origin = SEQUOIA_DISCORD_MANAGEMENT_URL;
  if (!origin) return Response.json({ error: "Discord management is not connected yet" }, { status: 503 });
  try {
    return await fetchImpl(`${origin.replace(/\/$/, "")}/v1/${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return Response.json({ error: "Discord management is temporarily unavailable" }, { status: 503 });
  }
}
