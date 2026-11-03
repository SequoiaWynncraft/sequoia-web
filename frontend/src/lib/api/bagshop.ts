import { isRecord } from "#lib/api/guards.js";

export type BagshopErrorCode =
  | "http_error"
  | "invalid_response"
  | "network_error"
  | "unauthorized"
  | "forbidden"
  | "out_of_stock"
  | "all_capped"
  | "below_minimum"
  | "already_claimed"
  | "channel_unavailable";

export interface BagshopError {
  code: BagshopErrorCode;
  message: string;
  status?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: BagshopError };

export const RARITIES = ["Unique", "Rare", "Legendary"] as const;
export type Rarity = (typeof RARITIES)[number];
export type OrderType = "buy" | "sell";

export interface InventoryItem {
  key: string;
  stock: number;
  sellPrice: number;
  buyPrice: number;
  cap: number;
}

export interface OrderItem {
  raid: string;
  rarity: string;
  amount: number;
}

export interface ProcessedItem {
  item: OrderItem;
  filled: boolean;
  declineReason?: string | null;
}

export interface Order {
  messageId: string;
  orderType: OrderType;
  note: string;
  userId: string;
  userName: string;
  minecraftIgn: string;
  createdAt: number;
  claimedByMention?: string | null;
  remainingItems: OrderItem[];
  processedItems: ProcessedItem[];
  linkedMessageId?: string | null;
  splitPart: number;
}

export interface BagshopMe {
  minecraftUuid: string;
  minecraftUsername?: string | null;
  discordId?: string | null;
  staff: boolean;
}

export interface PlacedOrderItem extends OrderItem {
  unitPrice: number;
  total: number;
}

export interface PlacedOrder {
  orderType: OrderType;
  minecraftIgn: string;
  note: string;
  cappedNotice: string;
  merged: boolean;
  createdAt: number;
  items: PlacedOrderItem[];
  combinedTotal: number;
}

export interface PlaceOrderPayload {
  orderType: OrderType;
  minecraftIgn: string;
  note?: string;
  items: OrderItem[];
}

export interface InventoryPatch {
  stock?: number;
  price?: number;
  cap?: number;
}

function isInventoryItem(value: unknown): value is InventoryItem {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.stock === "number" &&
    typeof value.sellPrice === "number" &&
    typeof value.buyPrice === "number" &&
    typeof value.cap === "number"
  );
}

function isOrderItem(value: unknown): value is OrderItem {
  return (
    isRecord(value) &&
    typeof value.raid === "string" &&
    typeof value.rarity === "string" &&
    typeof value.amount === "number"
  );
}

function isProcessedItem(value: unknown): value is ProcessedItem {
  return (
    isRecord(value) &&
    isOrderItem(value.item) &&
    typeof value.filled === "boolean" &&
    (value.declineReason == null || typeof value.declineReason === "string")
  );
}

function isOrder(value: unknown): value is Order {
  return (
    isRecord(value) &&
    typeof value.messageId === "string" &&
    (value.orderType === "buy" || value.orderType === "sell") &&
    typeof value.userId === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.splitPart === "number" &&
    Array.isArray(value.remainingItems) &&
    value.remainingItems.every(isOrderItem) &&
    Array.isArray(value.processedItems) &&
    value.processedItems.every(isProcessedItem)
  );
}

function isMe(value: unknown): value is BagshopMe {
  return isRecord(value) && typeof value.minecraftUuid === "string" && typeof value.staff === "boolean";
}

function isPlacedOrderItem(value: unknown): value is PlacedOrderItem {
  return (
    isRecord(value) &&
    typeof value.raid === "string" &&
    typeof value.rarity === "string" &&
    typeof value.amount === "number" &&
    typeof value.unitPrice === "number" &&
    typeof value.total === "number"
  );
}

function isPlacedOrder(value: unknown): value is PlacedOrder {
  return (
    isRecord(value) &&
    (value.orderType === "buy" || value.orderType === "sell") &&
    typeof value.merged === "boolean" &&
    typeof value.createdAt === "number" &&
    Array.isArray(value.items) &&
    value.items.every(isPlacedOrderItem) &&
    typeof value.combinedTotal === "number"
  );
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

const ERROR_CODES: Record<string, BagshopErrorCode> = {
  out_of_stock: "out_of_stock",
  all_capped: "all_capped",
  below_minimum: "below_minimum",
  already_claimed: "already_claimed",
  channel_unavailable: "channel_unavailable",
  not_owner: "forbidden",
  not_allowed: "forbidden",
  bagshop_unreachable: "network_error",
};

async function request(
  fetchImpl: typeof fetch,
  path: string,
  init?: RequestInit,
): Promise<ApiResult<unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/bagshop${path}`, {
      ...init,
      headers: { accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    return { ok: false, error: { code: "network_error", message: "Could not reach the bag shop." } };
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    return { ok: false, error: { code: "network_error", message: "Could not reach the bag shop." } };
  }
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const raw = isRecord(body)
      ? (typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "")
      : "";
    const code: BagshopErrorCode =
      ERROR_CODES[raw] ??
      (response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "http_error");
    return { ok: false, error: { code, message: raw || `Request failed (${response.status}).`, status: response.status } };
  }

  return { ok: true, data: body };
}

function validated<T>(result: ApiResult<unknown>, guard: (v: unknown) => v is T): ApiResult<T> {
  if (!result.ok) return result;
  if (!guard(result.data)) {
    return { ok: false, error: { code: "invalid_response", message: "Unexpected bag shop response." } };
  }
  return { ok: true, data: result.data };
}

export interface BagshopClient {
  getInventory(): Promise<ApiResult<InventoryItem[]>>;
  getMe(): Promise<ApiResult<BagshopMe>>;
  getMyOrders(): Promise<ApiResult<Order[]>>;
  placeOrder(payload: PlaceOrderPayload): Promise<ApiResult<PlacedOrder>>;
  cancelOrder(messageId: string): Promise<ApiResult<null>>;
  getOpenOrders(): Promise<ApiResult<Order[]>>;
  claimOrder(messageId: string): Promise<ApiResult<Order>>;
  declineOrder(messageId: string, reason: string): Promise<ApiResult<Order>>;
  fillItem(messageId: string, raid: string, rarity: string): Promise<ApiResult<Order>>;
  declineItem(messageId: string, raid: string, rarity: string, reason: string): Promise<ApiResult<Order>>;
  patchInventory(key: string, patch: InventoryPatch): Promise<ApiResult<InventoryItem>>;
}

export function createBagshopClient(options: { fetch: typeof fetch }): BagshopClient {
  const f = options.fetch;

  const postJson = (path: string, payload?: unknown) =>
    request(f, path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });

  return {
    async getInventory() {
      return validated(await request(f, "/inventory"), (v): v is InventoryItem[] => isArrayOf(v, isInventoryItem));
    },
    async getMe() {
      return validated(await request(f, "/me"), isMe);
    },
    async getMyOrders() {
      return validated(await request(f, "/orders/mine"), (v): v is Order[] => isArrayOf(v, isOrder));
    },
    async placeOrder(payload) {
      return validated(await postJson("/orders", payload), isPlacedOrder);
    },
    async cancelOrder(messageId) {
      const result = await postJson(`/orders/${encodeURIComponent(messageId)}/cancel`);
      return result.ok ? { ok: true, data: null } : result;
    },
    async getOpenOrders() {
      return validated(await request(f, "/orders/open"), (v): v is Order[] => isArrayOf(v, isOrder));
    },
    async claimOrder(messageId) {
      return validated(await postJson(`/orders/${encodeURIComponent(messageId)}/claim`), isOrder);
    },
    async declineOrder(messageId, reason) {
      return validated(await postJson(`/orders/${encodeURIComponent(messageId)}/decline`, { reason }), isOrder);
    },
    async fillItem(messageId, raid, rarity) {
      return validated(
        await postJson(`/orders/${encodeURIComponent(messageId)}/items/${encodeURIComponent(raid)}/${encodeURIComponent(rarity)}/fill`),
        isOrder,
      );
    },
    async declineItem(messageId, raid, rarity, reason) {
      return validated(
        await postJson(`/orders/${encodeURIComponent(messageId)}/items/${encodeURIComponent(raid)}/${encodeURIComponent(rarity)}/decline`, { reason }),
        isOrder,
      );
    },
    async patchInventory(key, patch) {
      return validated(
        await request(f, `/inventory/${encodeURIComponent(key)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        }),
        isInventoryItem,
      );
    },
  };
}

export function splitInventoryKey(key: string): { raid: string; rarity: string } {
  const sep = key.lastIndexOf("_");
  return sep < 0 ? { raid: key, rarity: "" } : { raid: key.slice(0, sep), rarity: key.slice(sep + 1) };
}
