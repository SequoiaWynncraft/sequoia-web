import { SEQUOIA_API_BASE_URL } from "$lib/config/public";

/** The two reward queues a member can request from, matching the backend's `RequestType`. */
export const REWARD_REQUEST_TYPES = ["aspect", "tome"] as const;
export type RewardRequestType = (typeof REWARD_REQUEST_TYPES)[number];

/** Upper bound on a tome request reason, matching the backend's `MAX_REASON_LENGTH`. */
export const MAX_TOME_REASON_LENGTH = 1000;

const REWARD_QUEUE_REQUESTS_PATH = "/api/reward-queue/requests";
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Result of creating a reward queue request. Mirrors the backend's HTTP outcomes:
 * 201 created (with the caller's position in the queue), 409 duplicate pending request,
 * 403 forbidden (not a guild member, ineligible, or Minecraft not linked), 400 invalid,
 * 401 expired session, and everything else (503/426/network) as a soft "unavailable".
 */
export type CreateRewardQueueResult =
  | { status: "created"; position: number | null }
  | { status: "duplicate" }
  | { status: "forbidden"; message: string }
  | { status: "invalid"; message: string }
  | { status: "signin" }
  | { status: "unavailable" };

/** Narrows an unknown value to a reward request type, or null when it is neither. */
export function parseRewardRequestType(value: unknown): RewardRequestType | null {
  return typeof value === "string" && (REWARD_REQUEST_TYPES as readonly string[]).includes(value)
    ? (value as RewardRequestType)
    : null;
}

/** Pulls a human-readable error message out of a parsed error body, falling back to `fallback`. */
function errorMessage(body: unknown, fallback: string): string {
  if (body !== null && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim().length > 0) return record.message;
  }
  return fallback;
}

/**
 * Forwards a reward queue request to the Sequoia backend on the viewer's behalf, attaching the
 * `seq_session` JWT as a bearer token. The backend enforces all eligibility (guild membership,
 * rank/requirements, Minecraft link, and duplicate detection); this function only maps the HTTP
 * outcome onto a {@link CreateRewardQueueResult}. The token never reaches the browser.
 */
export async function createRewardQueueRequest(
  token: string,
  type: RewardRequestType,
  reason: string | null,
  fetchImpl: typeof fetch,
): Promise<CreateRewardQueueResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${SEQUOIA_API_BASE_URL}${REWARD_QUEUE_REQUESTS_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(type === "tome" ? { type, reason } : { type }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { status: "unavailable" };
  }

  const text = await response.text().catch(() => "");
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (response.status === 201) {
    const position =
      body !== null && typeof body === "object" && typeof (body as Record<string, unknown>).position === "number"
        ? ((body as Record<string, unknown>).position as number)
        : null;
    return { status: "created", position };
  }
  if (response.status === 409) return { status: "duplicate" };
  if (response.status === 401) return { status: "signin" };
  if (response.status === 403) {
    return { status: "forbidden", message: errorMessage(body, "You're not eligible to make this request.") };
  }
  if (response.status === 400) {
    return { status: "invalid", message: errorMessage(body, "That request couldn't be submitted.") };
  }
  return { status: "unavailable" };
}
