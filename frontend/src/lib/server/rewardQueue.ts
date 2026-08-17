import { SEQUOIA_API_BASE_URL, SEQUOIA_MOD_VERSION } from "$lib/config/public";

/** The two reward queues a member can request from, matching the backend's `RequestType`. */
export const REWARD_REQUEST_TYPES = ["aspect", "tome"] as const;
export type RewardRequestType = (typeof REWARD_REQUEST_TYPES)[number];

/**
 * A reward queue request to forward to the backend. A tome request carries a non-empty reason;
 * an aspect request never carries one, so the two shapes are kept distinct at the type level.
 */
export type RewardQueueRequest = { type: "tome"; reason: string } | { type: "aspect" };

const REWARD_QUEUE_REQUESTS_PATH = "/api/reward-queue/requests";
const REWARD_QUEUE_QUEUES_PATH = "/api/reward-queue/queues";
const REWARD_QUEUE_ELIGIBILITY_PATH = "/api/reward-queue/eligibility";
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
    if (typeof record.message === "string" && record.message.trim().length > 0) return record.message.trim();
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
  request: RewardQueueRequest,
  fetchImpl: typeof fetch,
): Promise<CreateRewardQueueResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${SEQUOIA_API_BASE_URL}${REWARD_QUEUE_REQUESTS_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        // The backend's JwtAuthInterceptor gates /api/** on a mod-version check before auth and
        // returns 426 without a usable version when running in ENFORCE mode. The website is a
        // first-party client, so it advertises the current mod release to clear that gate.
        "x-sequoia-mod-version": SEQUOIA_MOD_VERSION,
      },
      body: JSON.stringify(
        request.type === "tome" ? { type: "tome", reason: request.reason } : { type: "aspect" },
      ),
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

/**
 * One pending request exactly as the backend returns it. This shape stays on the server:
 * it carries the requester's Discord id, which the load function turns into an `isViewer`
 * flag so no member's Discord id is ever serialized into another member's page.
 */
export interface RewardQueueSourceEntry {
  requestId: number;
  /** Discord snowflake of the requester - the identity a rename can't break. */
  discordId: string;
  minecraftUsername: string;
  guildRank: string | null;
  /** When the request joined the queue, in epoch milliseconds. */
  createdAtMs: number;
}

/** Both pending reward queues, front first, or a soft failure the page renders without. */
export type RewardQueuesResult =
  | { status: "ok"; queues: Record<RewardRequestType, RewardQueueSourceEntry[]> }
  | { status: "unavailable" };

/** The viewer's own eligibility for the reward queues, as the backend computes it. */
export interface RewardQueueEligibility {
  eligible: boolean;
  hasHqRole: boolean;
  raidCountLast7Days: number;
  inGuildTimeInDays: number;
  /** Raids in the last 7 days the backend requires, so the copy never hardcodes it. */
  requiredRaids: number;
  /** Days in the guild the backend requires. */
  requiredDays: number;
  /** The backend's own explanation when ineligible, null when eligible. */
  message: string | null;
}

/**
 * Eligibility, a viewer whose Minecraft account isn't linked yet, a viewer the backend refuses
 * outright (not a guild member, banned), or a soft failure that leaves the buttons enabled.
 */
export type RewardQueueEligibilityResult =
  | { status: "ok"; eligibility: RewardQueueEligibility }
  | { status: "notLinked"; message: string }
  | { status: "refused"; message: string }
  | { status: "unavailable" };

/** One reward queue read: the HTTP status it came back with, and the parsed body if there was one. */
interface RewardQueueRead {
  status: number;
  body: unknown;
}

/**
 * Reads a JSON body from a reward queue endpoint on the viewer's behalf. Returns null when
 * the request never produced a response at all (network failure, timeout); otherwise the
 * status travels with the body so a caller can tell a refusal it can explain (403) apart
 * from the ones it can't - a missing endpoint (404, not deployed yet), a client-compat
 * rejection (426), or an outage (503) - which all stay one soft "unavailable".
 */
async function readRewardQueueJson(
  path: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<RewardQueueRead | null> {
  let response: Response;
  try {
    response = await fetchImpl(`${SEQUOIA_API_BASE_URL}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "x-sequoia-mod-version": SEQUOIA_MOD_VERSION,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
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
  return { status: response.status, body };
}

/** The parsed body of a 200, or null for every other outcome. */
function okBody(read: RewardQueueRead | null): unknown {
  return read !== null && read.status === 200 ? read.body : null;
}

/** Narrows an unknown value to a plain record, so field reads below are safe. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Validates one queue entry from the backend. Every field the UI renders is required, so a
 * drifted or half-populated entry is dropped rather than rendered as `undefined`.
 */
function parseQueueEntry(value: unknown): RewardQueueSourceEntry | null {
  const record = asRecord(value);
  if (record === null) return null;

  const requestId = record.request_id;
  const discordId = record.discord_id;
  const minecraftUsername = record.minecraft_username;
  const createdAt = record.created_at;
  if (typeof requestId !== "number" || typeof discordId !== "string" || typeof minecraftUsername !== "string") {
    return null;
  }

  const createdAtMs = typeof createdAt === "string" ? Date.parse(createdAt) : Number.NaN;
  if (!Number.isFinite(createdAtMs)) return null;

  const guildRank = record.guild_rank;
  return {
    requestId,
    discordId,
    minecraftUsername,
    guildRank: typeof guildRank === "string" && guildRank.trim().length > 0 ? guildRank.trim() : null,
    createdAtMs,
  };
}

/**
 * Validates one queue array. A single entry failing the guard above fails the whole read:
 * position is this array's index, so silently dropping an entry would move everyone behind
 * it one place up the queue - and could tell a member who is queued that they aren't.
 * A partly-parsed queue is not a queue, so it degrades to "unavailable" instead.
 */
function parseQueue(value: unknown): RewardQueueSourceEntry[] | null {
  if (!Array.isArray(value)) return null;

  const entries: RewardQueueSourceEntry[] = [];
  for (const item of value) {
    const entry = parseQueueEntry(item);
    if (entry === null) return null;
    entries.push(entry);
  }
  return entries;
}

/**
 * Reads both pending reward queues. The response is validated field by field rather than
 * trusted, matching the API client's discipline: this contract lives in a separate repo and
 * the page would otherwise render whatever drift it returned.
 */
export async function fetchRewardQueues(token: string, fetchImpl: typeof fetch): Promise<RewardQueuesResult> {
  const record = asRecord(okBody(await readRewardQueueJson(REWARD_QUEUE_QUEUES_PATH, token, fetchImpl)));
  if (record === null) return { status: "unavailable" };

  const aspect = parseQueue(record.aspect);
  const tome = parseQueue(record.tome);
  if (aspect === null || tome === null) return { status: "unavailable" };

  return { status: "ok", queues: { aspect, tome } };
}

/**
 * Reads the viewer's own reward queue eligibility so the page can state the requirement
 * before the request instead of after the 403.
 *
 * A 403 is the one refusal worth naming rather than softening: the backend answers it for the
 * same viewer on every single read and every submit, so folding it into "unavailable" would
 * leave exactly the members who can never succeed clicking a live button to find out. Every
 * other failure stays soft - the caller leaves the buttons enabled and lets the backend rule
 * on the submission.
 *
 * Two different layers answer 403 here, and they are told apart by the body. The handler only
 * ever refuses an unlinked Minecraft account, and it refuses through Spring, whose error body
 * carries no `code` - and, with `server.error.include-message` left at its `never` default, no
 * `message` either, so the fallback wording below is what a member actually reads. The auth
 * interceptor runs before the handler and writes its own `{ code, message }` for a non-member
 * or a banned player; that message is already member-facing, so it is passed through.
 */
export async function fetchRewardQueueEligibility(
  token: string,
  fetchImpl: typeof fetch,
): Promise<RewardQueueEligibilityResult> {
  const read = await readRewardQueueJson(REWARD_QUEUE_ELIGIBILITY_PATH, token, fetchImpl);
  if (read !== null && read.status === 403) {
    const code = asRecord(read.body)?.code;
    if (typeof code === "string" && code.trim().length > 0) {
      return {
        status: "refused",
        message: errorMessage(read.body, "This account can't use the reward queue."),
      };
    }
    return {
      status: "notLinked",
      message: errorMessage(read.body, "Link your Minecraft account before requesting."),
    };
  }

  const record = asRecord(okBody(read));
  if (record === null) return { status: "unavailable" };

  const { eligible, has_hq_role, raid_count_last_7_days, in_guild_time_in_days, required_raids, required_days } =
    record;
  if (
    typeof eligible !== "boolean" ||
    typeof raid_count_last_7_days !== "number" ||
    typeof in_guild_time_in_days !== "number" ||
    typeof required_raids !== "number" ||
    typeof required_days !== "number"
  ) {
    return { status: "unavailable" };
  }

  return {
    status: "ok",
    eligibility: {
      eligible,
      hasHqRole: has_hq_role === true,
      raidCountLast7Days: raid_count_last_7_days,
      inGuildTimeInDays: in_guild_time_in_days,
      requiredRaids: required_raids,
      requiredDays: required_days,
      message: typeof record.message === "string" && record.message.trim().length > 0 ? record.message.trim() : null,
    },
  };
}
