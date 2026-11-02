import { afterEach, describe, expect, it, vi } from "vitest";

import { bagshopUrl, proxyToBagshop } from "#lib/server/bagshop.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bagshopUrl", () => {
  it("joins the configured base with the path", () => {
    // No BAGSHOP_API_URL set in tests → falls back to the local default.
    expect(bagshopUrl("/inventory")).toBe("http://localhost:8090/inventory");
    expect(bagshopUrl("me")).toBe("http://localhost:8090/me");
  });
});

describe("proxyToBagshop", () => {
  it("forwards the session token as a bearer and passes the upstream response through", async () => {
    let seenUrl = "";
    let seenAuth: string | null = null;
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
      seenUrl = String(input);
      seenAuth = new Headers(init.headers).get("authorization");
      return new Response(JSON.stringify([{ key: "NOTG_Rare" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await proxyToBagshop("/orders/mine", { method: "GET", token: "jwt-123", search: "?limit=5" });

    expect(seenUrl).toBe("http://localhost:8090/orders/mine?limit=5");
    expect(seenAuth).toBe("Bearer jwt-123");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("omits the Authorization header when there is no session token", async () => {
    let seenAuth: string | null = "unset";
    vi.stubGlobal("fetch", async (_input: string, init: RequestInit) => {
      seenAuth = new Headers(init.headers).get("authorization");
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });

    await proxyToBagshop("/inventory", { method: "GET", token: undefined });

    expect(seenAuth).toBeNull();
  });

  it("degrades to a 503 when the bag shop is unreachable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });

    const response = await proxyToBagshop("/inventory", { method: "GET", token: undefined });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "bagshop_unreachable" });
  });
});
