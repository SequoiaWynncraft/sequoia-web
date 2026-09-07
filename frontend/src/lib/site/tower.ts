/**
 * Wynncraft guild tower calculator.
 *
 * Ported 1:1 from the webmap's `sequoia_shared::tower` (Rust). Keep the two in
 * sync: the numbers here are compared against the map's sidebar panel.
 */

/** Damage ranges per tower damage upgrade level (0-11). */
export const DAMAGES: readonly (readonly [number, number])[] = [
  [1000, 1500],
  [1400, 2100],
  [1800, 2700],
  [2200, 3300],
  [2600, 3900],
  [3000, 4500],
  [3400, 5100],
  [3800, 5700],
  [4200, 6300],
  [4600, 6900],
  [5000, 7500],
  [5400, 8100],
];

/** Attack speed multiplier per tower attack upgrade level (0-11). */
export const ATTACK_RATES: readonly number[] = [
  0.5, 0.75, 1.0, 1.25, 1.61, 2.0, 2.5, 3.0, 3.6, 3.8, 4.35, 4.7,
];

/** Tower HP per health upgrade level (0-11). */
export const HEALTHS: readonly number[] = [
  300_000, 450_000, 600_000, 750_000, 960_000, 1_200_000, 1_500_000, 1_860_000, 2_220_000,
  2_580_000, 2_940_000, 3_300_000,
];

/** Damage reduction percentage per defense upgrade level (0-11). */
export const DEFENSES: readonly number[] = [
  10, 40, 55, 62.5, 70, 75, 79, 82, 84, 86, 88, 90,
];

/** Aura cooldown labels (level 0 = off, 1-3 = cooldown seconds). */
export const AURA_LABELS: readonly string[] = ["Off", "24s", "18s", "12s"];

/** Volley cooldown labels (level 0 = off, 1-3 = cooldown seconds). */
export const VOLLEY_LABELS: readonly string[] = ["Off", "20s", "15s", "10s"];

/** Highest upgrade level for damage, attack, health and defense. */
export const MAX_STAT_LEVEL = 11;

/** Highest upgrade level for aura and volley. */
export const MAX_AURA_LEVEL = 3;

/** Flat defense-index bonus when Aura is enabled (level > 0). */
const AURA_NONZERO_BONUS = 5;

/** Flat defense-index bonus when Volley is enabled (level > 0). */
const VOLLEY_NONZERO_BONUS = 3;

/** Flat defense-index bonus applied to HQ territories. */
const HQ_BASE_INDEX_BONUS = 13;

/** Per-connection defense-index bonus for HQ territories. */
const HQ_CONNECTION_INDEX_BONUS = 6;

/** Per-external defense-index bonus for HQ territories. */
const HQ_EXTERNAL_INDEX_BONUS = 2;

/** Per-connected-territory bonus multiplier (30% per connection). */
export const CONNECTION_BONUS = 0.3;

/** HQ external base multiplier (+50% before any externals). */
export const HQ_EXTERNAL_BASE = 1.5;

/** Per-external multiplier for HQ (+25% per external). */
export const HQ_EXTERNAL_BONUS = 0.25;

const clampLevel = (level: number, max: number): number =>
  Math.min(Math.max(Math.trunc(level), 0), max);

/**
 * Apply connection and HQ multipliers to a base stat value.
 *
 * `connections` = number of allied-owned connected territories.
 * `externals` = number of allied-owned territories reachable within 3 hops.
 */
export function calcStat(
  base: number,
  isHq: boolean,
  connections: number,
  externals: number,
): number {
  const connMult = 1 + connections * CONNECTION_BONUS;
  if (!isHq) return base * connMult;
  return base * connMult * (HQ_EXTERNAL_BASE + externals * HQ_EXTERNAL_BONUS);
}

/**
 * Min/max DPS band for the given damage & attack levels with multipliers.
 *
 * The `* 2` is deliberate, not a slip: a tower attack lands two hits, so real
 * output is twice the per-hit figure in {@link DAMAGES}. Dropping it halves
 * every DPS number the calculator shows.
 */
export function calcDpsRange(
  damageLevel: number,
  attackLevel: number,
  isHq: boolean,
  connections: number,
  externals: number,
): [number, number] {
  const [lo, hi] = DAMAGES[clampLevel(damageLevel, MAX_STAT_LEVEL)];
  const rate = ATTACK_RATES[clampLevel(attackLevel, MAX_STAT_LEVEL)];
  return [
    calcStat(lo * 2 * rate, isHq, connections, externals),
    calcStat(hi * 2 * rate, isHq, connections, externals),
  ];
}

/** Average DPS for the given damage & attack levels with multipliers. */
export function calcDps(
  damageLevel: number,
  attackLevel: number,
  isHq: boolean,
  connections: number,
  externals: number,
): number {
  const [lo, hi] = calcDpsRange(damageLevel, attackLevel, isHq, connections, externals);
  return (lo + hi) / 2;
}

/** Effective HP for the given health & defense levels with multipliers. */
export function calcEhp(
  healthLevel: number,
  defenseLevel: number,
  isHq: boolean,
  connections: number,
  externals: number,
): number {
  const hp = HEALTHS[clampLevel(healthLevel, MAX_STAT_LEVEL)];
  const defPct = DEFENSES[clampLevel(defenseLevel, MAX_STAT_LEVEL)] / 100;
  return calcStat(hp / (1 - defPct), isHq, connections, externals);
}

/**
 * Integer defense index from upgrade levels and HQ/network state.
 *
 * Base: `damage + attack + health + defense + aura + volley`
 * `+ (aura > 0 ? 5 : 0) + (volley > 0 ? 3 : 0)`.
 * HQ bonus: `13 + 6 * connections + 2 * externals`, otherwise 0.
 */
export function calcDefenseIndex(
  damageLevel: number,
  attackLevel: number,
  healthLevel: number,
  defenseLevel: number,
  auraLevel: number,
  volleyLevel: number,
  isHq: boolean,
  connections: number,
  externals: number,
): number {
  const damage = clampLevel(damageLevel, MAX_STAT_LEVEL);
  const attack = clampLevel(attackLevel, MAX_STAT_LEVEL);
  const health = clampLevel(healthLevel, MAX_STAT_LEVEL);
  const defense = clampLevel(defenseLevel, MAX_STAT_LEVEL);
  const aura = clampLevel(auraLevel, MAX_AURA_LEVEL);
  const volley = clampLevel(volleyLevel, MAX_AURA_LEVEL);

  const baseIndex =
    damage +
    attack +
    health +
    defense +
    aura +
    volley +
    (aura > 0 ? AURA_NONZERO_BONUS : 0) +
    (volley > 0 ? VOLLEY_NONZERO_BONUS : 0);

  const hqBonus = isHq
    ? HQ_BASE_INDEX_BONUS +
      connections * HQ_CONNECTION_INDEX_BONUS +
      externals * HQ_EXTERNAL_INDEX_BONUS
    : 0;

  return baseIndex + hqBonus;
}

export interface DefenseRating {
  label: string;
  color: string;
}

/** Bucket a defense index into its rating label and colour. */
export function defenseRating(index: number): DefenseRating {
  if (index <= 5) return { label: "Very Low", color: "#8c8c8c" };
  if (index <= 18) return { label: "Low", color: "#eb5757" };
  if (index <= 30) return { label: "Medium", color: "#f5c542" };
  if (index <= 48) return { label: "High", color: "#66cc66" };
  return { label: "Very High", color: "#50c8dc" };
}

/**
 * How far from .5 the scaled remainder may sit and still count as a tie.
 *
 * `value * scale` rounds, so an exact half can arrive as x.5000000000000002 and
 * miss a `=== 0.5` test. The remainder is always in [0, 1), so the window is
 * scale-independent, and at these magnitudes the error is ~1e-15. The tradeoff:
 * a value genuinely 1e-10 past a half is now rounded as if it were a tie.
 */
const TIE_EPSILON = 1e-9;

/**
 * Fixed-point rounding that breaks ties to the even digit, the way Rust's
 * `{:.N}` does. `toFixed` rounds halves away from zero instead, which would
 * print 1.25M as "1.3M" where the map shows "1.2M".
 */
function toFixedHalfEven(value: number, digits: number): string {
  const scale = 10 ** digits;
  const scaled = value * scale;
  const floor = Math.floor(scaled);
  const remainder = scaled - floor;

  let rounded: number;
  if (Math.abs(remainder - 0.5) < TIE_EPSILON) rounded = floor % 2 === 0 ? floor : floor + 1;
  else if (remainder > 0.5) rounded = floor + 1;
  else rounded = floor;

  return (rounded / scale).toFixed(digits);
}

/** At or above this, `value / 1e3` rounds to 1000 rather than 999, so it reads in M. */
const M_THRESHOLD = 999_500;

/** At or above this, `value` rounds to 1000, so it reads in k. */
const K_THRESHOLD = 999.5;

/**
 * Format large numbers with k/M suffixes.
 *
 * The thresholds are the round-up boundaries, not the units themselves: testing
 * `value >= 1_000_000` would send 999999.9999999999 down the k branch, where it
 * rounds up and prints "1000k".
 */
export function formatStat(value: number): string {
  if (value >= M_THRESHOLD) return `${toFixedHalfEven(value / 1_000_000, 1)}M`;
  if (value >= K_THRESHOLD) return `${toFixedHalfEven(value / 1_000, 0)}k`;
  return toFixedHalfEven(value, 0);
}
