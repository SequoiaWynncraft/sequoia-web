import { splitInventoryKey, type InventoryItem, type Order, type OrderType } from "#lib/api/bagshop.js";
import type { CurrencyUnit } from "#lib/site/currency.js";

export const EB_PER_LE = 64;

export interface CurrencyPart {
  amount: number;
  unit: Extract<CurrencyUnit, "EB" | "LE">;
}

/** Splits an emerald-block amount into the denominations shown by the shop. */
export function currencyParts(eb: number): CurrencyPart[] {
  const safe = Number.isFinite(eb) ? Math.max(0, Math.round(eb)) : 0;
  const le = Math.floor(safe / EB_PER_LE);
  const rem = safe % EB_PER_LE;
  if (le === 0) return [{ amount: rem, unit: "EB" }];
  if (rem === 0) return [{ amount: le, unit: "LE" }];
  return [
    { amount: le, unit: "LE" },
    { amount: rem, unit: "EB" },
  ];
}

/** Formats an emerald-block amount as "3 LE 12 EB" — the shop's currency (1 LE = 64 EB). */
export function formatEb(eb: number): string {
  return currencyParts(eb)
    .map((part) => `${part.amount} ${part.unit}`)
    .join(" ");
}

/**
 * Rounds a raw EB total to whole LE the same way the bot does: buy orders round up
 * (the customer pays more), sell offers round down (the customer receives less).
 */
export function roundToLe(eb: number, orderType: OrderType): number {
  const safe = Math.max(0, Math.round(eb));
  return orderType === "buy" ? Math.ceil(safe / EB_PER_LE) * EB_PER_LE : Math.floor(safe / EB_PER_LE) * EB_PER_LE;
}

export interface RaidGroup {
  raid: string;
  items: (InventoryItem & { rarity: string })[];
}

/** Groups inventory rows by raid, preserving first-seen raid order. */
export function groupInventoryByRaid(inventory: InventoryItem[]): RaidGroup[] {
  const order: string[] = [];
  const byRaid = new Map<string, (InventoryItem & { rarity: string })[]>();
  for (const item of inventory) {
    const { raid, rarity } = splitInventoryKey(item.key);
    let bucket = byRaid.get(raid);
    if (!bucket) {
      bucket = [];
      byRaid.set(raid, bucket);
      order.push(raid);
    }
    bucket.push({ ...item, rarity });
  }
  return order.map((raid) => ({ raid, items: byRaid.get(raid) ?? [] }));
}

/**
 * Sum of an order's outstanding items using the supplied per-key unit prices, or `null` when
 * any item's price is unknown — so callers can hide the total rather than show one that silently
 * treats a missing price as zero.
 */
export function orderRemainingTotal(order: Order, unitPriceByKey: Map<string, number>): number | null {
  let sum = 0;
  for (const item of order.remainingItems) {
    const unit = unitPriceByKey.get(`${item.raid}_${item.rarity}`);
    if (unit === undefined) return null;
    sum += unit * item.amount;
  }
  return sum;
}

/** True while an order can still be cancelled by its owner (no staff has claimed it). */
export function isCancellable(order: Order): boolean {
  return order.claimedByMention === null || order.claimedByMention === undefined;
}
