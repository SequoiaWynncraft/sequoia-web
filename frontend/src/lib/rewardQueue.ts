/** Upper bound on a tome request reason, matching the backend's `MAX_REASON_LENGTH`. */
export const MAX_TOME_REASON_LENGTH = 1000;

/**
 * One pending request in a reward queue, as the page renders it. Mirrors the backend's
 * queue entry minus the tome reason, which the backend never exposes to other members,
 * and minus the Discord id, which the server resolves into {@link RewardQueueEntry.isViewer}
 * before this ever reaches a browser: the page needs to know which row is yours, not who
 * everyone else is.
 */
export interface RewardQueueEntry {
  requestId: number;
  minecraftUsername: string;
  guildRank: string | null;
  /** When the request joined the queue, in epoch milliseconds. */
  createdAtMs: number;
  /** Whether this row is the viewer's own, matched server-side on the Discord id. */
  isViewer: boolean;
}

/** Where one member sits in one queue. */
export interface QueueStanding {
  /** 1-based place in the queue, matching the backend's `position`. */
  position: number;
  /** Length of the whole queue, so the position reads as "#3 of 11". */
  total: number;
  entry: RewardQueueEntry;
}

/**
 * Finds the viewer's place in a queue, or null when they hold no pending request in it.
 * The row is flagged server-side by Discord id rather than by username, so a member who
 * renames in game keeps their place and the page never loses track of them mid-queue.
 */
export function queueStanding(entries: readonly RewardQueueEntry[]): QueueStanding | null {
  const index = entries.findIndex((entry) => entry.isViewer);
  if (index === -1) return null;
  return { position: index + 1, total: entries.length, entry: entries[index] };
}

/**
 * The entries the viewer is waiting behind, front first. Returns the whole queue for a
 * viewer who isn't in it, so the same list answers both "who's ahead of me" and
 * "who's waiting".
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
 * Numbers stay unspaced from their unit for the same reason `parseDuration`'s labels do
 * (see `#lib/site/duration.js`): these render through the uppercase pixel display face, where
 * a space between a number and its unit reads as two separate words.
 *
 * Anything under a minute (including a clock skewed slightly into the future) reads
 * "just now" rather than a negative or zero-valued figure.
 *
 * This is elapsed time, never an estimate of time remaining. Prefer
 * {@link requestedAgoLabel} anywhere the figure sits near a queue position, where a bare
 * duration invites reading the queue as an ETA it can't provide.
 */
export function elapsedLabel(createdAtMs: number, nowMs: number): string {
  const elapsed = nowMs - createdAtMs;
  if (!Number.isFinite(elapsed) || elapsed < MINUTE_MS) return "just now";

  const days = Math.floor(elapsed / DAY_MS);
  const hours = Math.floor((elapsed % DAY_MS) / HOUR_MS);
  // Past a day the minutes are noise, so the label stops at two units.
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;

  const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  return `${minutes}min`;
}

/**
 * The same figure phrased so it can only be read one way: `3h 5min ago`, or `just now`.
 * Drops in after "requested" or "joined", which is what makes it unambiguous - a bare
 * duration under a queue position reads as time left, and this page has no way to know
 * that. Staff hand rewards out by hand, so there is no rate to estimate from.
 */
export function requestedAgoLabel(createdAtMs: number, nowMs: number): string {
  const elapsed = elapsedLabel(createdAtMs, nowMs);
  return elapsed === "just now" ? elapsed : `${elapsed} ago`;
}
