import { describe, expect, it } from "vitest";

import { createBagshopClient, splitInventoryKey, type BagshopMe, type InventoryItem, type Order } from "$lib/api/bagshop";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const inventoryRow: InventoryItem = { key: "NOTG_Rare", stock: 5, sellPrice: 10, buyPrice: 13, cap: 0 };

const orderRow: Order = {
  messageId: "abc",
  orderType: "buy",
  note: "",
  userId: "42",
  userName: "tester",
  minecraftIgn: "Tester",
  createdAt: 1_700_000_000,
  claimedByMention: null,
  remainingItems: [{ raid: "NOTG", rarity: "Rare", amount: 2 }],
  processedItems: [],
  linkedMessageId: null,
  splitPart: 0,
};

const meRow: BagshopMe = {
  minecraftUuid: "0000-uuid",
  minecraftUsername: "Tester",
  discordId: "42",
  staff: true,
};

/** Records the URL + method of each proxy request while replying with `body`. */
function recordingClient(body: unknown) {
  const calls: { url: string; method: string }[] = [];
  const client = createBagshopClient({
    fetch: async (input, init) => {
      calls.push({ url: String(input), method: (init?.method ?? "GET").toUpperCase() });
      return jsonResponse(body);
    },
  });
  return { client, calls };
}

describe("splitInventoryKey", () => {
  it("splits raid and rarity", () => {
    expect(splitInventoryKey("NOTG_Rare")).toEqual({ raid: "NOTG", rarity: "Rare" });
    expect(splitInventoryKey("NOTG")).toEqual({ raid: "NOTG", rarity: "" });
  });
});

describe("createBagshopClient", () => {
  it("hits the same-origin proxy for inventory and validates the shape", async () => {
    const requests: string[] = [];
    const client = createBagshopClient({
      fetch: async (input) => {
        requests.push(String(input));
        return jsonResponse([inventoryRow]);
      },
    });

    const result = await client.getInventory();

    expect(requests).toEqual(["/api/bagshop/inventory"]);
    expect(result).toEqual({ ok: true, data: [inventoryRow] });
  });

  it("accepts a filled processed item with no declineReason (the bot's Gson omits nulls)", async () => {
    const wireOrder = {
      ...orderRow,
      processedItems: [{ item: { raid: "NOTG", rarity: "Rare", amount: 1 }, filled: true }],
    };
    const client = createBagshopClient({ fetch: async () => jsonResponse([wireOrder]) });
    const result = await client.getMyOrders();
    expect(result.ok).toBe(true);
  });

  it("rejects a processed item whose shape is malformed", async () => {
    const wireOrder = { ...orderRow, processedItems: [{ filled: true }] };
    const client = createBagshopClient({ fetch: async () => jsonResponse([wireOrder]) });
    const result = await client.getMyOrders();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_response");
  });

  it("rejects malformed inventory payloads", async () => {
    const client = createBagshopClient({ fetch: async () => jsonResponse([{ key: "NOTG_Rare" }]) });
    const result = await client.getInventory();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_response");
  });

  it("returns the caller's own orders", async () => {
    const client = createBagshopClient({ fetch: async () => jsonResponse([orderRow]) });
    const result = await client.getMyOrders();
    expect(result).toEqual({ ok: true, data: [orderRow] });
  });

  it("fetches the viewer's bag shop identity", async () => {
    const { client, calls } = recordingClient(meRow);
    const result = await client.getMe();
    expect(calls).toEqual([{ url: "/api/bagshop/me", method: "GET" }]);
    expect(result).toEqual({ ok: true, data: meRow });
  });

  it("fetches the staff open-orders queue", async () => {
    const { client, calls } = recordingClient([orderRow]);
    const result = await client.getOpenOrders();
    expect(calls).toEqual([{ url: "/api/bagshop/orders/open", method: "GET" }]);
    expect(result).toEqual({ ok: true, data: [orderRow] });
  });

  it("posts a fill for a single order item", async () => {
    const { client, calls } = recordingClient(orderRow);
    const result = await client.fillItem("abc", "NOTG", "Rare");
    expect(calls).toEqual([{ url: "/api/bagshop/orders/abc/items/NOTG/Rare/fill", method: "POST" }]);
    expect(result).toEqual({ ok: true, data: orderRow });
  });

  it("posts a decline with a reason for a single order item", async () => {
    const { client, calls } = recordingClient(orderRow);
    const result = await client.declineItem("abc", "NOTG", "Rare", "out of stock");
    expect(calls).toEqual([{ url: "/api/bagshop/orders/abc/items/NOTG/Rare/decline", method: "POST" }]);
    expect(result).toEqual({ ok: true, data: orderRow });
  });

  it("posts a decline for the whole order", async () => {
    const { client, calls } = recordingClient(orderRow);
    const result = await client.declineOrder("abc", "no longer available");
    expect(calls).toEqual([{ url: "/api/bagshop/orders/abc/decline", method: "POST" }]);
    expect(result).toEqual({ ok: true, data: orderRow });
  });

  it("patches an inventory row", async () => {
    const { client, calls } = recordingClient(inventoryRow);
    const result = await client.patchInventory("NOTG_Rare", { stock: 5 });
    expect(calls).toEqual([{ url: "/api/bagshop/inventory/NOTG_Rare", method: "PATCH" }]);
    expect(result).toEqual({ ok: true, data: inventoryRow });
  });

  it("maps a 422 out_of_stock body to a typed error", async () => {
    const client = createBagshopClient({ fetch: async () => jsonResponse({ error: "out_of_stock" }, 422) });
    const result = await client.placeOrder({ orderType: "buy", minecraftIgn: "Tester", items: [{ raid: "NOTG", rarity: "Rare", amount: 1 }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("out_of_stock");
      expect(result.error.status).toBe(422);
    }
  });

  it("maps a 403 to a forbidden error for staff actions", async () => {
    const client = createBagshopClient({ fetch: async () => jsonResponse({ error: "not_allowed" }, 403) });
    const result = await client.claimOrder("abc");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("forbidden");
  });

  it("treats a successful cancel as ok with no data", async () => {
    const client = createBagshopClient({ fetch: async () => jsonResponse({ ok: true }) });
    const result = await client.cancelOrder("abc");
    expect(result).toEqual({ ok: true, data: null });
  });

  it("surfaces network failures", async () => {
    const client = createBagshopClient({
      fetch: async () => {
        throw new Error("boom");
      },
    });
    const result = await client.getInventory();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("network_error");
  });
});
