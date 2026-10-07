import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { POST, GET } from "./[...path]/+server";

const privateEnv = vi.hoisted(() => ({ SEQUOIA_DISCORD_MANAGEMENT_URL: "http://sierra:8082" }));
vi.mock("$env/dynamic/private", () => ({ env: privateEnv }));

function event(method: string, origin: string | null = "https://seqwawa.com", token = "cookie-session", path = "messages") {
  const url = new URL(`https://seqwawa.com/manage/discord/api/${path}`);
  const fetchImpl = vi.fn().mockResolvedValue(Response.json({ id: "saved" }));
  const headers: Record<string, string> = { authorization: "Bearer browser-forgery", "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return {
    url, params: { path }, fetch: fetchImpl,
    request: new Request(url, { method, headers, body: method === "GET" ? undefined : '{"name":"Panel"}' }),
    cookies: { get: () => token || undefined },
  } as unknown as RequestEvent<{ path: string }>;
}

beforeEach(() => { privateEnv.SEQUOIA_DISCORD_MANAGEMENT_URL = "http://sierra:8082"; });

describe("Discord management server boundary", () => {
  it("rejects missing or foreign write origins before forwarding", async () => {
    for (const origin of [null, "https://other.example"]) {
      const request = event("POST", origin);
      await expect(POST(request as never)).rejects.toMatchObject({ status: 403 });
      expect(request.fetch).not.toHaveBeenCalled();
    }
  });
  it("uses only the session cookie and keeps the internal URL on the server", async () => {
    const request = event("POST");
    const response = await POST(request as never);
    expect(request.fetch).toHaveBeenCalledWith("http://sierra:8082/v1/messages", expect.objectContaining({
      method: "POST", body: '{"name":"Panel"}', redirect: "error",
      headers: { authorization: "Bearer cookie-session", "content-type": "application/json" },
    }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ id: "saved" });
  });
  it("forwards the navigation admission probe to the same Rust authority", async () => {
    const request = event("GET", null, "cookie-session", "access");
    expect((await GET(request as never)).status).toBe(200);
    expect(request.fetch).toHaveBeenCalledWith("http://sierra:8082/v1/access", expect.objectContaining({ method: "GET" }));
  });
  it("does not forward unauthenticated requests or arbitrary paths", async () => {
    const request = event("GET", null, "");
    expect((await GET(request as never)).status).toBe(401);
    expect(request.fetch).not.toHaveBeenCalled();
    const other = event("GET", null, "cookie-session", "../../admin");
    await expect(GET(other as never)).rejects.toMatchObject({ status: 404 });
    expect(other.fetch).not.toHaveBeenCalled();
  });
  it("returns useful unavailable and validation errors without exposing internal responses", async () => {
    const request = event("GET");
    privateEnv.SEQUOIA_DISCORD_MANAGEMENT_URL = "";
    expect((await GET(request as never)).status).toBe(503);
    expect(request.fetch).not.toHaveBeenCalled();
    privateEnv.SEQUOIA_DISCORD_MANAGEMENT_URL = "http://sierra:8082";
    vi.mocked(request.fetch).mockResolvedValueOnce(new Response("Invalid timestamp", { status: 422 }));
    expect(await (await GET(request as never)).json()).toEqual({ error: "Invalid timestamp" });
    vi.mocked(request.fetch).mockResolvedValueOnce(new Response("private infrastructure detail", { status: 502 }));
    expect(await (await GET(request as never)).text()).not.toContain("private infrastructure detail");
  });
});
