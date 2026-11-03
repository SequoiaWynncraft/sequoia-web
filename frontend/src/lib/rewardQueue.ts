export const MAX_TOME_REASON_LENGTH = 1000;

export interface RewardQueueEntry {
  requestId: number;
  minecraftUsername: string;
  guildRank: string | null;
  createdAtMs: number;
  isViewer: boolean;
}

export interface QueueStanding {
  /** 1-based place in the queue. */
  position: number;
  total: number;
  entry: RewardQueueEntry;
}

export function queueStanding(entries: readonly RewardQueueEntry[]): QueueStanding | null {
  const index = entries.findIndex((entry) => entry.isViewer);
  if (index === -1) return null;
  return { position: index + 1, total: entries.length, entry: entries[index] };
}

/**
 * The entries the viewer is waiting behind, front first. Returns the whole queue for a
 * viewer who isn't in it.
 */
export function entriesAhead(entries: readonly RewardQueueEntry[]): RewardQueueEntry[] {
  const index = entries.findIndex((entry) => entry.isViewer);
  return index === -1 ? [...entries] : entries.slice(0, index);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long ago a request was made, as a compact label like `2d 4h`, `3h`, or `18min`.
 * Anything under a minute (including a clock skewed slightly into the future) reads
 * "just now" rather than a negative or zero-valued figure.
 */
export function elapsedLabel(createdAtMs: number, nowMs: number): string {
  const elapsed = nowMs - createdAtMs;
  if (!Number.isFinite(elapsed) || elapsed < MINUTE_MS) return "just now";

  const days = Math.floor(elapsed / DAY_MS);
  const hours = Math.floor((elapsed % DAY_MS) / HOUR_MS);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;

  const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  return `${minutes}min`;
}

export function requestedAgoLabel(createdAtMs: number, nowMs: number): string {
  const elapsed = elapsedLabel(createdAtMs, nowMs);
  return elapsed === "just now" ? elapsed : `${elapsed} ago`;
}
