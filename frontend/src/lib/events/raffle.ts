/** One entrant in a raffle draw: identity plus the weight of their entry. */
export interface RaffleEntrant {
  player_uuid: string;
  username: string;
  /** Weighted ticket count; entrants with zero tickets never win. */
  tickets: number;
}

/** A drawn entrant: identity plus the frozen ticket count, before a slot is assigned. */
export interface DrawnEntrant {
  username: string;
  player_uuid: string;
  tickets: number;
}

export interface DrawOptions {
  /** UUIDs barred from winning (e.g. winners of other raffles in the event). */
  exclude?: Iterable<string>;
  /** Injectable [0, 1) source so draws are deterministic under test. */
  rng?: () => number;
}

/**
 * Draws up to `count` distinct winners from `pool`, weighting each entrant by
 * their ticket count (more tickets, higher odds). Selection is without
 * replacement, so nobody wins twice in one draw; excluded UUIDs and
 * zero-ticket entrants are dropped first. Returns fewer than `count` winners
 * only when the eligible pool is smaller. Ticket counts are frozen onto each
 * returned winner; the caller assigns each one a slot.
 */
/** Uuid identity tolerates spelling differences (case, hyphens): stored
 * winners, manual includes, and roster entries do not all share a format. */
function canonicalUuid(uuid: string): string {
  return uuid.replaceAll("-", "").toLowerCase();
}

/**
 * The exact candidate list a draw runs over: excluded UUIDs and zero-ticket
 * entrants dropped, duplicate UUIDs deduped on first sighting (two
 * leaderboard entries can resolve to the same roster member). Exported so a
 * display of the pool (e.g. the live wheel) filters identically to the draw.
 */
export function drawablePool(
  pool: RaffleEntrant[],
  exclude?: Iterable<string>,
): RaffleEntrant[] {
  const excluded = new Set([...(exclude ?? [])].map(canonicalUuid));
  const seen = new Set<string>();
  return pool.filter((entry) => {
    const key = canonicalUuid(entry.player_uuid);
    if (entry.tickets <= 0 || excluded.has(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function drawWinners(
  pool: RaffleEntrant[],
  count: number,
  { exclude, rng = Math.random }: DrawOptions = {},
): DrawnEntrant[] {
  // Fresh copy: entrants are spliced out as they win, so the caller's pool is
  // never mutated.
  const remaining = drawablePool(pool, exclude);
  const winners: DrawnEntrant[] = [];
  const target = Math.min(count, remaining.length);
  for (let drawn = 0; drawn < target; drawn++) {
    const total = remaining.reduce((sum, entry) => sum + entry.tickets, 0);
    // A tiny nudge below `total` keeps a threshold of exactly `total` (rng
    // returning a value that rounds up) from overshooting the last entrant.
    let threshold = rng() * total;
    let index = 0;
    while (index < remaining.length - 1 && threshold >= remaining[index].tickets) {
      threshold -= remaining[index].tickets;
      index++;
    }
    const [winner] = remaining.splice(index, 1);
    winners.push({
      username: winner.username,
      player_uuid: winner.player_uuid,
      tickets: winner.tickets,
    });
  }
  return winners;
}

/** Crypto-backed [0, 1) source for production draws. */
export function secureRng(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 2 ** 32;
}
