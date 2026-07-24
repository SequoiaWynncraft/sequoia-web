import { afterEach, describe, expect, it, vi } from "vitest";

import { createRewardQueueRequest, parseRewardRequestType } from "$lib/server/rewardQueue";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stubs global fetch with a single JSON response and records what the caller sent. */
function stubFetch(status: number, body: unknown) {
  const seen: { url: string; method: string; auth: string | null; body: string } = {
    url: "",
    method: "",
    auth: null,
    body: "",
  };
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    seen.url = String(input);
    seen.method = String(init.method);
    seen.auth = new Headers(init.headers).get("authorization");
    seen.body = String(init.body ?? "");
    return new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return seen;
}

describe("parseRewardRequestType", () => {
  it("accepts the two queue types and rejects anything else", () => {
    expect(parseRewardRequestType("aspect")).toBe("aspect");
    expect(parseRewardRequestType("tome")).toBe("tome");
    expect(parseRewardRequestType("weapon")).toBeNull();
    expect(parseRewardRequestType(null)).toBeNull();
    expect(parseRewardRequestType(42)).toBeNull();
  });
});

describe("createRewardQueueRequest", () => {
  it("posts an aspect request as a bearer token and returns the queue position", async () => {
    const seen = stubFetch(201, { request_id: 7, type: "aspect", position: 3 });

    const result = await createRewardQueueRequest("jwt-123", { type: "aspect" }, fetch);

    expect(seen.method).toBe("POST");
    expect(seen.url.endsWith("/api/reward-queue/requests")).toBe(true);
    expect(seen.auth).toBe("Bearer jwt-123");
    expect(JSON.parse(seen.body)).toEqual({ type: "aspect" });
    expect(result).toEqual({ status: "created", position: 3 });
  });

  it("includes the reason only for tome requests", async () => {
    const seen = stubFetch(201, { request_id: 8, type: "tome", position: 1 });

    await createRewardQueueRequest("jwt-9", { type: "tome", reason: "Grinding TCC" }, fetch);

    expect(JSON.parse(seen.body)).toEqual({ type: "tome", reason: "Grinding TCC" });
  });

  it("maps a 409 to a duplicate result", async () => {
    stubFetch(409, { message: "You already have a pending aspect request." });
    expect(await createRewardQueueRequest("t", { type: "aspect" }, fetch)).toEqual({ status: "duplicate" });
  });

  it("maps a 403 to forbidden and passes the backend message through", async () => {
    stubFetch(403, { message: "Reward queue requests require Captain rank." });
    expect(await createRewardQueueRequest("t", { type: "aspect" }, fetch)).toEqual({
      status: "forbidden",
      message: "Reward queue requests require Captain rank.",
    });
  });

  it("maps a 401 to a re-sign-in result", async () => {
    stubFetch(401, { code: "token_expired", message: "Expired token" });
    expect(await createRewardQueueRequest("t", { type: "aspect" }, fetch)).toEqual({ status: "signin" });
  });

  it("degrades a 503 to unavailable", async () => {
    stubFetch(503, { message: "Could not resolve your username." });
    expect(await createRewardQueueRequest("t", { type: "aspect" }, fetch)).toEqual({ status: "unavailable" });
  });

  it("degrades a network failure to unavailable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await createRewardQueueRequest("t", { type: "tome", reason: "x" }, fetch)).toEqual({ status: "unavailable" });
  });
});
