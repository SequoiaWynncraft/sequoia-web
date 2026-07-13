import { splitInventoryKey, type InventoryItem, type Order, type OrderType } from "$lib/api/bagshop";

export const EB_PER_LE = 64;

/** Formats an emerald-block amount as "3 LE 12 EB" — the shop's currency (1 LE = 64 EB). */
export function formatEb(eb: number): string {
  const safe = Math.max(0, Math.round(eb));
  const le = Math.floor(safe / EB_PER_LE);
  const rem = safe % EB_PER_LE;
  if (le === 0) return `${rem} EB`;
  if (rem === 0) return `${le} LE`;
  return `${le} LE ${rem} EB`;
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

/** Sum of an order's outstanding items using the supplied per-key unit prices. */
export function orderRemainingTotal(order: Order, unitPriceByKey: Map<string, number>): number {
  return order.remainingItems.reduce(
    (sum, item) => sum + (unitPriceByKey.get(`${item.raid}_${item.rarity}`) ?? 0) * item.amount,
    0,
  );
}

/** True while an order can still be cancelled by its owner (no staff has claimed it). */
export function isCancellable(order: Order): boolean {
  return order.claimedByMention === null || order.claimedByMention === undefined;
}
