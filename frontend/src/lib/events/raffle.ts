export interface RaffleEntrant {
  player_uuid: string;
  username: string;
  tickets: number;
}

export interface DrawnEntrant {
  username: string;
  player_uuid: string;
  tickets: number;
}

export interface DrawOptions {
  exclude?: Iterable<string>;
  rng?: () => number;
}

export function canonicalUuid(uuid: string): string {
  return uuid.replaceAll("-", "").toLowerCase();
}

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
  const remaining = drawablePool(pool, exclude);
  const winners: DrawnEntrant[] = [];
  const target = Math.min(count, remaining.length);
  for (let drawn = 0; drawn < target; drawn++) {
    const total = remaining.reduce((sum, entry) => sum + entry.tickets, 0);
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

export function secureRng(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 2 ** 32;
}
