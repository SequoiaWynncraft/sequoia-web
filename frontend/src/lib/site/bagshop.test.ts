import { describe, expect, it } from "vitest";

import type { InventoryItem, Order } from "#lib/api/bagshop.js";
import {
  currencyParts,
  formatEb,
  groupInventoryByRaid,
  isCancellable,
  orderRemainingTotal,
  roundToLe,
} from "#lib/site/bagshop.js";

function inv(key: string, over: Partial<InventoryItem> = {}): InventoryItem {
  return { key, stock: 0, sellPrice: 0, buyPrice: 0, cap: 0, ...over };
}

describe("formatEb", () => {
  it("formats sub-LE amounts as EB", () => {
    expect(formatEb(0)).toBe("0 EB");
    expect(formatEb(59)).toBe("59 EB");
  });

  it("formats whole and mixed LE amounts", () => {
    expect(formatEb(64)).toBe("1 LE");
    expect(formatEb(123)).toBe("1 LE 59 EB");
    expect(formatEb(128)).toBe("2 LE");
  });

  it("never renders negative amounts", () => {
    expect(formatEb(-5)).toBe("0 EB");
  });
});

describe("currencyParts", () => {
  it("returns the icon denominations used by the formatted amount", () => {
    expect(currencyParts(0)).toEqual([{ amount: 0, unit: "EB" }]);
    expect(currencyParts(64)).toEqual([{ amount: 1, unit: "LE" }]);
    expect(currencyParts(123)).toEqual([
      { amount: 1, unit: "LE" },
      { amount: 59, unit: "EB" },
    ]);
  });

  it("normalizes invalid, negative, and fractional inputs", () => {
    expect(currencyParts(Number.NaN)).toEqual([{ amount: 0, unit: "EB" }]);
    expect(currencyParts(Number.POSITIVE_INFINITY)).toEqual([{ amount: 0, unit: "EB" }]);
    expect(currencyParts(-1)).toEqual([{ amount: 0, unit: "EB" }]);
    expect(currencyParts(12.4)).toEqual([{ amount: 12, unit: "EB" }]);
    expect(currencyParts(12.5)).toEqual([{ amount: 13, unit: "EB" }]);
  });

  it("rounds across denomination boundaries", () => {
    expect(currencyParts(63.4)).toEqual([{ amount: 63, unit: "EB" }]);
    expect(currencyParts(63.5)).toEqual([{ amount: 1, unit: "LE" }]);
    expect(currencyParts(64.4)).toEqual([{ amount: 1, unit: "LE" }]);
    expect(currencyParts(64.5)).toEqual([
      { amount: 1, unit: "LE" },
      { amount: 1, unit: "EB" },
    ]);
  });
});

describe("roundToLe", () => {
  it("rounds buy orders up and sell offers down", () => {
    expect(roundToLe(100, "buy")).toBe(128);
    expect(roundToLe(100, "sell")).toBe(64);
    expect(roundToLe(128, "buy")).toBe(128);
    expect(roundToLe(128, "sell")).toBe(128);
  });
});

describe("groupInventoryByRaid", () => {
  it("groups by raid preserving first-seen order", () => {
    const groups = groupInventoryByRaid([
      inv("NOTG_Unique", { stock: 5 }),
      inv("NOTG_Rare"),
      inv("NOL_Unique"),
    ]);
    expect(groups.map((g) => g.raid)).toEqual(["NOTG", "NOL"]);
    expect(groups[0].items.map((i) => i.rarity)).toEqual(["Unique", "Rare"]);
    expect(groups[0].items[0].stock).toBe(5);
  });
});

describe("orderRemainingTotal / isCancellable", () => {
  const order: Order = {
    messageId: "1",
    orderType: "buy",
    note: "",
    userId: "42",
    userName: "tester",
    minecraftIgn: "Tester",
    createdAt: 1_700_000_000,
    claimedByMention: null,
    remainingItems: [
      { raid: "NOTG", rarity: "Rare", amount: 3 },
      { raid: "NOL", rarity: "Unique", amount: 2 },
    ],
    processedItems: [],
    linkedMessageId: null,
    splitPart: 0,
  };

  it("totals outstanding items with the supplied unit prices", () => {
    const prices = new Map([
      ["NOTG_Rare", 10],
      ["NOL_Unique", 100],
    ]);
    expect(orderRemainingTotal(order, prices)).toBe(3 * 10 + 2 * 100);
  });

  it("returns null when any item's price is unknown rather than counting it as zero", () => {
    const prices = new Map([["NOTG_Rare", 10]]); // NOL_Unique missing
    expect(orderRemainingTotal(order, prices)).toBeNull();
  });

  it("treats an unclaimed order as cancellable", () => {
    expect(isCancellable(order)).toBe(true);
    expect(isCancellable({ ...order, claimedByMention: "staff <@1>" })).toBe(false);
  });
});
