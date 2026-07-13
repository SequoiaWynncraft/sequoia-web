import { describe, expect, it } from "vitest";

import { createBagshopClient, splitInventoryKey, type InventoryItem, type Order } from "$lib/api/bagshop";

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
