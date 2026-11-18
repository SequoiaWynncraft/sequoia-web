import { afterEach, describe, expect, it, vi } from "vitest";

import { createBagshopClient } from "#lib/api/bagshop.js";
import { bagshopUrl, matchBagshopEndpoint, proxyToBagshop } from "#lib/server/bagshop.js";

// Synthetic identifiers; each is distinctive so a substring search proves it stayed server-side.
const STAFF_MENTION = "<@100000000000000001>";
const STAFF_ID = "100000000000000001";
const CUSTOMER_DISCORD_ID = "200000000000000002";
const LINKED_MESSAGE_ID = "400000000000000004";
const UPSTREAM_ONLY = "upstream-only-fixture-value";

interface Upstream {
  url: string;
  method: string;
  body: string | undefined;
  redirect: RequestRedirect | undefined;
  auth: string | null;
}

function stubUpstream(body: unknown, status = 200): Upstream[] {
  const seen: Upstream[] = [];
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    seen.push({
      url: String(input),
      method: String(init.method),
      body: init.body as string | undefined,
      redirect: init.redirect,
      auth: new Headers(init.headers).get("authorization"),
    });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(status === 204 ? null : text, { status, headers: { "content-type": "application/json" } });
  });
  return seen;
}

function upstreamOrder(overrides: Record<string, unknown> = {}) {
  return {
    messageId: "300000000000000003",
    orderType: "buy",
    note: "fixture note",
    userId: CUSTOMER_DISCORD_ID,
    userName: "fixture-customer",
    minecraftIgn: "FixtureIgn",
    createdAt: 1_700_000_000,
    claimedByMention: STAFF_MENTION,
    remainingItems: [{ raid: "NOTG", rarity: "Rare", amount: 2, extra: UPSTREAM_ONLY }],
    processedItems: [
      { item: { raid: "NOL", rarity: "Unique", amount: 1 }, filled: false, declineReason: "out of stock", by: STAFF_MENTION },
    ],
    linkedMessageId: LINKED_MESSAGE_ID,
    splitPart: 0,
    staffNote: UPSTREAM_ONLY,
    ...overrides,
  };
}

const BROWSER_ORDER = {
  messageId: "300000000000000003",
  orderType: "buy",
  note: "fixture note",
  userName: "fixture-customer",
  minecraftIgn: "FixtureIgn",
  createdAt: 1_700_000_000,
  claimed: true,
  remainingItems: [{ raid: "NOTG", rarity: "Rare", amount: 2 }],
  processedItems: [{ item: { raid: "NOL", rarity: "Unique", amount: 1 }, filled: false, declineReason: "out of stock" }],
  splitPart: 0,
};

function expectNoUpstreamOnlyData(text: string) {
  for (const value of [STAFF_ID, CUSTOMER_DISCORD_ID, LINKED_MESSAGE_ID, UPSTREAM_ONLY]) expect(text).not.toContain(value);
}

async function proxy(method: string, path: string, body?: unknown) {
  const response = await proxyToBagshop({
    method,
    path,
    token: "fixture-token",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bagshopUrl", () => {
  it("joins the configured base with the path", () => {
    expect(bagshopUrl("/inventory")).toBe("http://localhost:8090/inventory");
    expect(bagshopUrl("me")).toBe("http://localhost:8090/me");
  });
});

describe("bag shop endpoint allowlist", () => {
  it.each([
    ["GET", "inventory", "/inventory"],
    ["PATCH", "inventory/NOTG_Rare", "/inventory/NOTG_Rare"],
    ["GET", "me", "/me"],
    ["GET", "orders/mine", "/orders/mine"],
    ["GET", "orders/open", "/orders/open"],
    ["POST", "orders", "/orders"],
    ["POST", "orders/a/cancel", "/orders/a/cancel"],
    ["POST", "orders/a/claim", "/orders/a/claim"],
    ["POST", "orders/a/decline", "/orders/a/decline"],
    ["POST", "orders/a/items/NOTG/Rare/fill", "/orders/a/items/NOTG/Rare/fill"],
    ["POST", "orders/a/items/NOTG/Rare/decline", "/orders/a/items/NOTG/Rare/decline"],
  ])("routes %s %s", (method, path, upstreamPath) => {
    expect(matchBagshopEndpoint(method, path)?.upstreamPath).toBe(upstreamPath);
  });

  it.each([
    ["GET", "orders"],
    ["POST", "orders/mine"],
    ["PATCH", "orders/a/claim"],
    ["GET", "orders/mine/"],
    ["GET", "/orders/mine"],
    ["GET", "orders//mine"],
    ["GET", "Orders/mine"],
    ["GET", "orders/./mine"],
    ["POST", "orders/../claim"],
    ["GET", ""],
    ["GET", "admin"],
  ])("does not route %s %j", (method, path) => {
    expect(matchBagshopEndpoint(method, path)).toBeNull();
  });

  it("answers unrouted requests itself without contacting the bag shop", async () => {
    const seen = stubUpstream([upstreamOrder()]);

    const { status, text } = await proxy("GET", "orders/mine/");

    expect(status).toBe(404);
    expect(JSON.parse(text)).toEqual({ error: "not_found" });
    expect(seen).toEqual([]);
  });

  it("re-encodes captured segments for the upstream URL", () => {
    expect(matchBagshopEndpoint("PATCH", "inventory/a b?c#d")?.upstreamPath).toBe("/inventory/a%20b%3Fc%23d");
  });

  it("forwards the session as a bearer, sends no query string and refuses redirects", async () => {
    const seen = stubUpstream([]);

    await proxy("GET", "inventory");

    expect(seen).toEqual([
      { url: "http://localhost:8090/inventory", method: "GET", body: undefined, redirect: "error", auth: "Bearer fixture-token" },
    ]);
  });

  it("omits the Authorization header when there is no session token", async () => {
    const seen = stubUpstream([]);

    await proxyToBagshop({ method: "GET", path: "inventory", token: undefined });

    expect(seen[0].auth).toBeNull();
  });

  it("degrades to a 503 when the bag shop is unreachable or redirects", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });

    const { status, text } = await proxy("GET", "inventory");

    expect(status).toBe(503);
    expect(JSON.parse(text)).toEqual({ error: "bagshop_unreachable" });
  });
});

describe("bag shop response contracts", () => {
  it("reduces a customer's own orders to the browser contract", async () => {
    stubUpstream([upstreamOrder(), upstreamOrder({ messageId: "5", claimedByMention: null })]);

    const { status, text } = await proxy("GET", "orders/mine");

    expect(status).toBe(200);
    expectNoUpstreamOnlyData(text);
    expect(JSON.parse(text)).toEqual([BROWSER_ORDER, { ...BROWSER_ORDER, messageId: "5", claimed: false }]);
  });

  it.each([
    ["GET", "orders/open", undefined, [upstreamOrder()], [BROWSER_ORDER]],
    ["POST", "orders/a/claim", undefined, upstreamOrder(), BROWSER_ORDER],
    ["POST", "orders/a/decline", { reason: "r" }, upstreamOrder(), BROWSER_ORDER],
    ["POST", "orders/a/items/NOTG/Rare/fill", undefined, upstreamOrder(), BROWSER_ORDER],
    ["POST", "orders/a/items/NOTG/Rare/decline", { reason: "r" }, upstreamOrder(), BROWSER_ORDER],
  ])("projects orders from %s %s", async (method, path, body, upstream, expected) => {
    stubUpstream(upstream);

    const { status, text } = await proxy(method, path, body);

    expect(status).toBe(200);
    expectNoUpstreamOnlyData(text);
    expect(JSON.parse(text)).toEqual(expected);
  });

  it("projects inventory rows and edits", async () => {
    const row = { key: "NOTG_Rare", stock: 5, sellPrice: 10, buyPrice: 13, cap: 0, supplier: UPSTREAM_ONLY };
    const browserRow = { key: "NOTG_Rare", stock: 5, sellPrice: 10, buyPrice: 13, cap: 0 };

    stubUpstream([row]);
    const list = await proxy("GET", "inventory");
    expect(JSON.parse(list.text)).toEqual([browserRow]);

    stubUpstream(row);
    const edited = await proxy("PATCH", "inventory/NOTG_Rare", { stock: 4 });
    expect(JSON.parse(edited.text)).toEqual(browserRow);
  });

  it("projects the viewer's own bag shop identity", async () => {
    stubUpstream({ minecraftUuid: "u1", minecraftUsername: "Fixture", discordId: "1", staff: false, roles: UPSTREAM_ONLY });

    const { text } = await proxy("GET", "me");

    expect(JSON.parse(text)).toEqual({ minecraftUuid: "u1", minecraftUsername: "Fixture", discordId: "1", staff: false });
  });

  it("projects a placed order", async () => {
    stubUpstream({
      orderType: "sell",
      minecraftIgn: "FixtureIgn",
      note: "",
      cappedNotice: "",
      merged: true,
      createdAt: 1,
      items: [{ raid: "NOTG", rarity: "Rare", amount: 1, unitPrice: 10, total: 10, margin: UPSTREAM_ONLY }],
      combinedTotal: 10,
      mergedInto: upstreamOrder(),
    });

    const { status, text } = await proxy("POST", "orders", {
      orderType: "sell",
      minecraftIgn: "FixtureIgn",
      items: [{ raid: "NOTG", rarity: "Rare", amount: 1 }],
    });

    expect(status).toBe(200);
    expectNoUpstreamOnlyData(text);
    expect(JSON.parse(text)).toEqual({
      orderType: "sell",
      minecraftIgn: "FixtureIgn",
      note: "",
      cappedNotice: "",
      merged: true,
      createdAt: 1,
      items: [{ raid: "NOTG", rarity: "Rare", amount: 1, unitPrice: 10, total: 10 }],
      combinedTotal: 10,
    });
  });

  it("answers a cancel with no body whatever the bag shop returns", async () => {
    stubUpstream(upstreamOrder());

    const response = await proxyToBagshop({ method: "POST", path: "orders/a/cancel", token: "fixture-token" });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("fails closed when a successful body doesn't match the contract", async () => {
    for (const [method, path, upstream] of [
      ["GET", "orders/mine", [{ messageId: "1", userId: CUSTOMER_DISCORD_ID }]],
      ["GET", "inventory", { rows: [] }],
      ["GET", "me", "not json"],
    ] as const) {
      stubUpstream(upstream);
      const { status, text } = await proxy(method, path);
      expect(status, path).toBe(502);
      expect(JSON.parse(text), path).toEqual({ error: "invalid_response" });
    }
  });

  it("forwards documented error codes and drops everything else from error bodies", async () => {
    stubUpstream({ error: "already_claimed", claimedBy: STAFF_MENTION }, 409);
    const known = await proxy("POST", "orders/a/claim");
    expect(known.status).toBe(409);
    expect(JSON.parse(known.text)).toEqual({ error: "already_claimed" });

    stubUpstream({ error: `order held by ${STAFF_MENTION}`, message: UPSTREAM_ONLY }, 400);
    const unknown = await proxy("POST", "orders/a/claim");
    expect(unknown.status).toBe(400);
    expect(JSON.parse(unknown.text)).toEqual({});

    stubUpstream("<html>upstream failure</html>", 500);
    const html = await proxy("GET", "orders/mine");
    expect(html.status).toBe(500);
    expect(JSON.parse(html.text)).toEqual({});
  });
});

describe("bag shop request contracts", () => {
  it("rebuilds request bodies from the documented payloads", async () => {
    const cases: [string, string, unknown, unknown, unknown][] = [
      [
        "POST",
        "orders",
        { orderType: "buy", minecraftIgn: "Ign", note: "n", items: [{ raid: "NOTG", rarity: "Rare", amount: 1, x: 1 }], userId: "1" },
        { orderType: "buy", minecraftIgn: "Ign", note: "n", items: [{ raid: "NOTG", rarity: "Rare", amount: 1 }] },
        { orderType: "buy", minecraftIgn: "Ign", note: "n", cappedNotice: "", merged: false, createdAt: 1, items: [], combinedTotal: 0 },
      ],
      ["POST", "orders/a/decline", { reason: "r", staff: "x" }, { reason: "r" }, upstreamOrder()],
      ["PATCH", "inventory/NOTG_Rare", { stock: 1, cap: 2, key: "other" }, { stock: 1, cap: 2 }, { key: "NOTG_Rare", stock: 1, sellPrice: 1, buyPrice: 1, cap: 2 }],
    ];
    for (const [method, path, sent, forwarded, upstream] of cases) {
      const seen = stubUpstream(upstream);
      await proxy(method, path, sent);
      expect(JSON.parse(seen[0].body as string), path).toEqual(forwarded);
    }
  });

  it("sends no body to endpoints that take none", async () => {
    const seen = stubUpstream(upstreamOrder());

    await proxy("POST", "orders/a/claim", { reason: "ignored" });

    expect(seen[0].body).toBeUndefined();
  });

  it("rejects a malformed payload before contacting the bag shop", async () => {
    const seen = stubUpstream({});

    const { status, text } = await proxy("POST", "orders/a/decline", { reason: 5 });

    expect(status).toBe(400);
    expect(JSON.parse(text)).toEqual({ error: "bad_request" });
    expect(seen).toEqual([]);
  });
});

describe("bag shop client through the proxy", () => {
  it("reaches a routed endpoint for every client method", async () => {
    stubUpstream({});
    const routed: string[] = [];
    const client = createBagshopClient({
      fetch: async (input, init) => {
        const url = new URL(String(input), "https://site.test");
        expect(url.pathname.startsWith("/api/bagshop/")).toBe(true);
        const path = decodeURIComponent(url.pathname.slice("/api/bagshop/".length));
        const method = (init?.method ?? "GET").toUpperCase();
        if (matchBagshopEndpoint(method, path)) routed.push(`${method} ${path}`);
        return new Response("{}", { status: 400 });
      },
    });

    await client.getInventory();
    await client.getMe();
    await client.getMyOrders();
    await client.getOpenOrders();
    await client.placeOrder({ orderType: "buy", minecraftIgn: "Ign", items: [] });
    await client.cancelOrder("a");
    await client.claimOrder("a");
    await client.declineOrder("a", "r");
    await client.fillItem("a", "NOTG", "Rare");
    await client.declineItem("a", "NOTG", "Rare", "r");
    await client.patchInventory("NOTG_Rare", { stock: 1 });

    expect(routed).toHaveLength(11);
  });
});
