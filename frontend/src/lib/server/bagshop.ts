import { BAGSHOP_API_URL } from "$app/env/private";

import {
  BAGSHOP_ERROR_CODES,
  isInventoryItem,
  isMe,
  isOrderItem,
  isPlacedOrder,
  isProcessedItem,
  type BagshopMe,
  type InventoryItem,
  type InventoryPatch,
  type Order,
  type OrderItem,
  type PlacedOrder,
  type PlaceOrderPayload,
  type ProcessedItem,
} from "#lib/api/bagshop.js";
import { isRecord } from "#lib/api/guards.js";

const DEFAULT_BAGSHOP_URL = "http://localhost:8090";

export function bagshopUrl(path: string): string {
  const base = (BAGSHOP_API_URL || DEFAULT_BAGSHOP_URL).replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

type Method = "GET" | "POST" | "PATCH";

/**
 * One bag shop endpoint the browser client calls. `path` is matched segment by
 * segment; `:name` segments are captured and re-encoded for the upstream URL.
 * Request bodies are rebuilt from the documented payload, and every successful
 * body is rebuilt from the documented response, so nothing the client contract
 * doesn't name passes in either direction.
 */
interface Endpoint {
  method: Method;
  path: readonly string[];
  request?: (body: unknown) => unknown;
  response: ((body: unknown) => unknown) | "empty";
}

const ENDPOINTS: readonly Endpoint[] = [
  { method: "GET", path: ["inventory"], response: (body) => projectList(body, toBrowserInventoryItem) },
  { method: "PATCH", path: ["inventory", ":key"], request: toUpstreamInventoryPatch, response: toBrowserInventoryItem },
  { method: "GET", path: ["me"], response: toBrowserMe },
  { method: "GET", path: ["orders", "mine"], response: (body) => projectList(body, toBrowserOrder) },
  { method: "GET", path: ["orders", "open"], response: (body) => projectList(body, toBrowserOrder) },
  { method: "POST", path: ["orders"], request: toUpstreamPlaceOrder, response: toBrowserPlacedOrder },
  { method: "POST", path: ["orders", ":id", "cancel"], response: "empty" },
  { method: "POST", path: ["orders", ":id", "claim"], response: toBrowserOrder },
  { method: "POST", path: ["orders", ":id", "decline"], request: toUpstreamReason, response: toBrowserOrder },
  { method: "POST", path: ["orders", ":id", "items", ":raid", ":rarity", "fill"], response: toBrowserOrder },
  {
    method: "POST",
    path: ["orders", ":id", "items", ":raid", ":rarity", "decline"],
    request: toUpstreamReason,
    response: toBrowserOrder,
  },
];

interface ProxyRequest {
  method: string;
  /** The route's rest parameter, e.g. `orders/mine` - no leading slash, already decoded. */
  path: string;
  token: string | undefined;
  body?: string;
}

/** Resolves a browser request to an endpoint and the encoded upstream path, or null if it isn't one. */
export function matchBagshopEndpoint(method: string, path: string): { endpoint: Endpoint; upstreamPath: string } | null {
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  for (const endpoint of ENDPOINTS) {
    if (endpoint.method !== method || endpoint.path.length !== segments.length) continue;
    const matches = endpoint.path.every((part, index) => part.startsWith(":") || part === segments[index]);
    if (matches) {
      return {
        endpoint,
        upstreamPath: `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`,
      };
    }
  }
  return null;
}

export async function proxyToBagshop(request: ProxyRequest): Promise<Response> {
  const match = matchBagshopEndpoint(request.method.toUpperCase(), request.path);
  if (!match) return jsonResponse(404, { error: "not_found" });
  const { endpoint, upstreamPath } = match;

  let body: string | undefined;
  if (endpoint.request) {
    const payload = endpoint.request(parseJson(request.body ?? ""));
    if (payload === null) return jsonResponse(400, { error: "bad_request" });
    body = JSON.stringify(payload);
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (request.token) headers.authorization = `Bearer ${request.token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  let upstream: Response;
  let text: string;
  try {
    upstream = await fetch(bagshopUrl(upstreamPath), {
      method: endpoint.method,
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    text = await upstream.text();
  } catch (err) {
    console.error(`bag shop proxy request to ${endpoint.method} /${endpoint.path.join("/")} failed:`, err);
    return jsonResponse(503, { error: "bagshop_unreachable" });
  }

  if (upstream.status >= 400 && upstream.status <= 599) {
    return jsonResponse(upstream.status, toBrowserError(parseJson(text)));
  }
  if (!upstream.ok) return jsonResponse(502, { error: "invalid_response" });
  if (endpoint.response === "empty") return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  const projected = endpoint.response(parseJson(text));
  if (projected === null) return jsonResponse(502, { error: "invalid_response" });
  return jsonResponse(upstream.status, projected);
}

/**
 * Upstream error bodies are reduced to a documented error code. Anything else
 * (free text, ids, stack traces) is dropped; the client then falls back to its
 * status-based copy.
 */
function toBrowserError(body: unknown): { error?: string } {
  const code = isRecord(body) && typeof body.error === "string" ? body.error : null;
  return code !== null && Object.hasOwn(BAGSHOP_ERROR_CODES, code) ? { error: code } : {};
}

function toBrowserInventoryItem(value: unknown): InventoryItem | null {
  if (!isInventoryItem(value)) return null;
  return { key: value.key, stock: value.stock, sellPrice: value.sellPrice, buyPrice: value.buyPrice, cap: value.cap };
}

function toBrowserMe(value: unknown): BagshopMe | null {
  if (!isMe(value)) return null;
  const me: BagshopMe = { minecraftUuid: value.minecraftUuid, staff: value.staff };
  if (typeof value.minecraftUsername === "string" || value.minecraftUsername === null) {
    me.minecraftUsername = value.minecraftUsername;
  }
  if (typeof value.discordId === "string" || value.discordId === null) me.discordId = value.discordId;
  return me;
}

/**
 * The service also names the customer's Discord id, the claiming staff
 * member's Discord mention and internal message links; the pages only show
 * whether an order is claimed.
 */
function toBrowserOrder(value: unknown): Order | null {
  if (!isRecord(value)) return null;
  const { messageId, orderType, createdAt, splitPart, remainingItems, processedItems } = value;
  if (
    typeof messageId !== "string" ||
    (orderType !== "buy" && orderType !== "sell") ||
    typeof createdAt !== "number" ||
    typeof splitPart !== "number" ||
    !Array.isArray(remainingItems) ||
    !remainingItems.every(isOrderItem) ||
    !Array.isArray(processedItems) ||
    !processedItems.every(isProcessedItem)
  ) {
    return null;
  }
  return {
    messageId,
    orderType,
    note: stringOrEmpty(value.note),
    userName: stringOrEmpty(value.userName),
    minecraftIgn: stringOrEmpty(value.minecraftIgn),
    createdAt,
    claimed: typeof value.claimedByMention === "string" && value.claimedByMention.length > 0,
    remainingItems: remainingItems.map(toOrderItem),
    processedItems: processedItems.map(toBrowserProcessedItem),
    splitPart,
  };
}

function toBrowserProcessedItem(entry: ProcessedItem): ProcessedItem {
  const item = toOrderItem(entry.item);
  return typeof entry.declineReason === "string"
    ? { item, filled: entry.filled, declineReason: entry.declineReason }
    : { item, filled: entry.filled };
}

function toBrowserPlacedOrder(value: unknown): PlacedOrder | null {
  if (!isPlacedOrder(value)) return null;
  return {
    orderType: value.orderType,
    minecraftIgn: stringOrEmpty(value.minecraftIgn),
    note: stringOrEmpty(value.note),
    cappedNotice: stringOrEmpty(value.cappedNotice),
    merged: value.merged,
    createdAt: value.createdAt,
    items: value.items.map((item) => ({ ...toOrderItem(item), unitPrice: item.unitPrice, total: item.total })),
    combinedTotal: value.combinedTotal,
  };
}

function toUpstreamPlaceOrder(value: unknown): PlaceOrderPayload | null {
  if (!isRecord(value)) return null;
  const { orderType, minecraftIgn, note, items } = value;
  if (
    (orderType !== "buy" && orderType !== "sell") ||
    typeof minecraftIgn !== "string" ||
    (note !== undefined && typeof note !== "string") ||
    !Array.isArray(items) ||
    !items.every(isOrderItem)
  ) {
    return null;
  }
  const payload: PlaceOrderPayload = { orderType, minecraftIgn, items: items.map(toOrderItem) };
  if (note !== undefined) payload.note = note;
  return payload;
}

function toUpstreamReason(value: unknown): { reason: string } | null {
  return isRecord(value) && typeof value.reason === "string" ? { reason: value.reason } : null;
}

function toUpstreamInventoryPatch(value: unknown): InventoryPatch | null {
  if (!isRecord(value)) return null;
  const patch: InventoryPatch = {};
  for (const field of ["stock", "price", "cap"] as const) {
    const amount = value[field];
    if (amount === undefined) continue;
    if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
    patch[field] = amount;
  }
  return patch;
}

function toOrderItem(item: OrderItem): OrderItem {
  return { raid: item.raid, rarity: item.rarity, amount: item.amount };
}

function projectList<T>(body: unknown, project: (value: unknown) => T | null): T[] | null {
  if (!Array.isArray(body)) return null;
  const projected = body.map(project);
  return projected.every((entry) => entry !== null) ? (projected as T[]) : null;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseJson(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
