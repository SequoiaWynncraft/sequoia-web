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
export function drawWinners(
  pool: RaffleEntrant[],
  count: number,
  { exclude, rng = Math.random }: DrawOptions = {},
): DrawnEntrant[] {
  const excluded = new Set(exclude ?? []);
  // Fresh copy: entrants are spliced out as they win, so the caller's pool is
  // never mutated. A uuid can appear more than once when two leaderboard entries
  // resolve to the same roster member; dedupe on first sighting so a member can
  // never take two slots in one draw.
  const seen = new Set<string>();
  const remaining = pool.filter((entry) => {
    if (entry.tickets <= 0 || excluded.has(entry.player_uuid) || seen.has(entry.player_uuid)) {
      return false;
    }
    seen.add(entry.player_uuid);
    return true;
  });
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
