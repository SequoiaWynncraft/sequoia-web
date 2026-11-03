import { SEQUOIA_API_BASE_URL, SEQUOIA_MOD_VERSION } from "#lib/config/public.js";

export const REWARD_REQUEST_TYPES = ["aspect", "tome"] as const;
export type RewardRequestType = (typeof REWARD_REQUEST_TYPES)[number];

export type RewardQueueRequest = { type: "tome"; reason: string } | { type: "aspect" };

const REWARD_QUEUE_REQUESTS_PATH = "/api/reward-queue/requests";
const REWARD_QUEUE_QUEUES_PATH = "/api/reward-queue/queues";
const REWARD_QUEUE_ELIGIBILITY_PATH = "/api/reward-queue/eligibility";
const REQUEST_TIMEOUT_MS = 5000;

export type CreateRewardQueueResult =
  | { status: "created"; position: number | null }
  | { status: "duplicate" }
  | { status: "forbidden"; message: string }
  | { status: "invalid"; message: string }
  | { status: "signin" }
  | { status: "unavailable" };

export function parseRewardRequestType(value: unknown): RewardRequestType | null {
  return typeof value === "string" && (REWARD_REQUEST_TYPES as readonly string[]).includes(value)
    ? (value as RewardRequestType)
    : null;
}

function errorMessage(body: unknown, fallback: string): string {
  if (body !== null && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim().length > 0) return record.message.trim();
  }
  return fallback;
}

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

export interface RewardQueueSourceEntry {
  requestId: number;
  discordId: string;
  minecraftUsername: string;
  guildRank: string | null;
  createdAtMs: number;
}

export type RewardQueuesResult =
  | { status: "ok"; queues: Record<RewardRequestType, RewardQueueSourceEntry[]> }
  | { status: "unavailable" };

export interface RewardQueueEligibility {
  eligible: boolean;
  hasHqRole: boolean;
  raidCountLast7Days: number;
  inGuildTimeInDays: number;
  requiredRaids: number;
  requiredDays: number;
  message: string | null;
}

export type RewardQueueEligibilityResult =
  | { status: "ok"; eligibility: RewardQueueEligibility }
  | { status: "notLinked"; message: string }
  | { status: "refused"; message: string }
  | { status: "unavailable" };

interface RewardQueueRead {
  status: number;
  body: unknown;
}

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

function okBody(read: RewardQueueRead | null): unknown {
  return read !== null && read.status === 200 ? read.body : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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

export async function fetchRewardQueues(token: string, fetchImpl: typeof fetch): Promise<RewardQueuesResult> {
  const record = asRecord(okBody(await readRewardQueueJson(REWARD_QUEUE_QUEUES_PATH, token, fetchImpl)));
  if (record === null) return { status: "unavailable" };

  const aspect = parseQueue(record.aspect);
  const tome = parseQueue(record.tome);
  if (aspect === null || tome === null) return { status: "unavailable" };

  return { status: "ok", queues: { aspect, tome } };
}

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
