import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { POST, GET, PUT, DELETE } from "./[...path]/+server";

const privateEnv = vi.hoisted(() => ({ SEQUOIA_DISCORD_MANAGEMENT_URL: "http://sierra:8082" }));
vi.mock("$app/env/private", () => ({
  get SEQUOIA_DISCORD_MANAGEMENT_URL() {
    return privateEnv.SEQUOIA_DISCORD_MANAGEMENT_URL;
  },
}));

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
  it("forwards welcome settings only with the expected methods and session authority", async () => {
    const request = event("PUT", "https://seqwawa.com", "cookie-session", "welcome");
    await PUT(request as never);
    expect(request.fetch).toHaveBeenCalledWith("http://sierra:8082/v1/welcome", expect.objectContaining({
      method: "PUT", headers: { authorization: "Bearer cookie-session", "content-type": "application/json" },
    }));
    for (const [method, handler, path] of [["POST", POST, "welcome"], ["DELETE", DELETE, "welcome"], ["GET", GET, "welcome/preview"]] as const) {
      const invalid = event(method, "https://seqwawa.com", "cookie-session", path);
      await expect(handler(invalid as never)).rejects.toMatchObject({ status: 405 });
      expect(invalid.fetch).not.toHaveBeenCalled();
    }
    const arbitrary = event("POST", "https://seqwawa.com", "cookie-session", "welcome/send");
    await expect(POST(arbitrary as never)).rejects.toMatchObject({ status: 404 });
    expect(arbitrary.fetch).not.toHaveBeenCalled();
  });
  it("preserves welcome renderer transport bytes privately without treating them as JSON", async () => {
    // Transport sentinels only, not a successful renderer or accepted artwork fixture.
    for (const type of ["image/png", "image/gif"]) {
      const request = event("POST", "https://seqwawa.com", "cookie-session", "welcome/preview");
      const bytes = new Uint8Array([0, 19, 255, 7]);
      vi.mocked(request.fetch).mockResolvedValueOnce(new Response(bytes, { headers: { "content-type": type } }));
      const response = await POST(request as never);
      expect(response.headers.get("content-type")).toBe(type);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    }
  });
  it("rejects foreign welcome writes and preserves unavailable/conflict responses", async () => {
    const foreign = event("POST", "https://other.example", "cookie-session", "welcome/preview");
    await expect(POST(foreign as never)).rejects.toMatchObject({ status: 403 });
    expect(foreign.fetch).not.toHaveBeenCalled();
    for (const status of [409, 503]) {
      const request = event("PUT", "https://seqwawa.com", "cookie-session", "welcome");
      vi.mocked(request.fetch).mockResolvedValueOnce(Response.json({ error: "Not ready" }, { status }));
      const response = await PUT(request as never);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "Not ready" });
    }
  });
  it("forwards ceremony settings and previews only with the expected methods", async () => {
    for (const [method, handler] of [["GET", GET], ["PUT", PUT]] as const) {
      const request = event(method, "https://seqwawa.com", "cookie-session", "ceremonies");
      expect((await handler(request as never)).status).toBe(200);
      expect(request.fetch).toHaveBeenCalledWith("http://sierra:8082/v1/ceremonies", expect.objectContaining({
        method, headers: { authorization: "Bearer cookie-session", "content-type": "application/json" },
      }));
    }
    for (const [method, handler, path] of [["POST", POST, "ceremonies"], ["DELETE", DELETE, "ceremonies"], ["GET", GET, "ceremonies/preview"], ["PUT", PUT, "ceremonies/preview"]] as const) {
      const invalid = event(method, "https://seqwawa.com", "cookie-session", path);
      await expect(handler(invalid as never)).rejects.toMatchObject({ status: 405 });
      expect(invalid.fetch).not.toHaveBeenCalled();
    }
    for (const path of ["ceremonies/send", "ceremonies/preview/extra", "ceremony"]) {
      const arbitrary = event("POST", "https://seqwawa.com", "cookie-session", path);
      await expect(POST(arbitrary as never)).rejects.toMatchObject({ status: 404 });
      expect(arbitrary.fetch).not.toHaveBeenCalled();
    }
    const foreign = event("POST", "https://other.example", "cookie-session", "ceremonies/preview");
    await expect(POST(foreign as never)).rejects.toMatchObject({ status: 403 });
    expect(foreign.fetch).not.toHaveBeenCalled();
    const conflict = event("PUT", "https://seqwawa.com", "cookie-session", "ceremonies");
    vi.mocked(conflict.fetch).mockResolvedValueOnce(Response.json({ error: "Stale version" }, { status: 409 }));
    const response = await PUT(conflict as never);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Stale version" });
  });
  it("forwards the achievement catalog only with GET and PUT", async () => {
    for (const [method, handler] of [["GET", GET], ["PUT", PUT]] as const) {
      const request = event(method, "https://seqwawa.com", "cookie-session", "achievements/catalog");
      expect((await handler(request as never)).status).toBe(200);
      expect(request.fetch).toHaveBeenCalledWith("http://sierra:8082/v1/achievements/catalog", expect.objectContaining({
        method, headers: { authorization: "Bearer cookie-session", "content-type": "application/json" },
      }));
    }
    for (const [method, handler] of [["POST", POST], ["DELETE", DELETE]] as const) {
      const invalid = event(method, "https://seqwawa.com", "cookie-session", "achievements/catalog");
      await expect(handler(invalid as never)).rejects.toMatchObject({ status: 405 });
      expect(invalid.fetch).not.toHaveBeenCalled();
    }
    for (const path of ["achievements", "achievements/catalog/extra", "achievements/progress"]) {
      const arbitrary = event("GET", null, "cookie-session", path);
      await expect(GET(arbitrary as never)).rejects.toMatchObject({ status: 404 });
      expect(arbitrary.fetch).not.toHaveBeenCalled();
    }
    const foreign = event("PUT", "https://other.example", "cookie-session", "achievements/catalog");
    await expect(PUT(foreign as never)).rejects.toMatchObject({ status: 403 });
    expect(foreign.fetch).not.toHaveBeenCalled();
    for (const status of [400, 409]) {
      const request = event("PUT", "https://seqwawa.com", "cookie-session", "achievements/catalog");
      vi.mocked(request.fetch).mockResolvedValueOnce(Response.json({ error: "Rejected" }, { status }));
      const response = await PUT(request as never);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "Rejected" });
    }
  });
  it("preserves ceremony renderer bytes privately without treating them as JSON", async () => {
    // Transport sentinels only, not a rendered ceremony.
    for (const type of ["image/png", "image/gif"]) {
      const request = event("POST", "https://seqwawa.com", "cookie-session", "ceremonies/preview");
      const bytes = new Uint8Array([7, 0, 255, 19]);
      vi.mocked(request.fetch).mockResolvedValueOnce(new Response(bytes, { headers: { "content-type": type } }));
      const response = await POST(request as never);
      expect(request.fetch).toHaveBeenCalledWith("http://sierra:8082/v1/ceremonies/preview", expect.objectContaining({ method: "POST" }));
      expect(response.headers.get("content-type")).toBe(type);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    }
  });
  it("forwards durable WebP bytes privately rather than parsing them as JSON", async () => {
    const request = event("GET", null, "cookie-session", "assets/11111111-1111-1111-1111-111111111111");
    const bytes = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    vi.mocked(request.fetch).mockResolvedValueOnce(new Response(bytes, { headers: { "content-type": "image/webp" } }));
    const response = await GET(request as never);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
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
  it("forwards selected-guild context without changing the protected path", async () => {
    const request = event("GET", null, "cookie-session", "context");
    request.url.searchParams.set("guild_id", "1104432054717927544");
    expect((await GET(request as never)).status).toBe(200);
    expect(request.fetch).toHaveBeenCalledWith("http://sierra:8082/v1/context?guild_id=1104432054717927544", expect.objectContaining({ method: "GET" }));
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
