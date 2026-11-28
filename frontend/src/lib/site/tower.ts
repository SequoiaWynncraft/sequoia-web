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

export const ATTACK_RATES: readonly number[] = [
  0.5, 0.75, 1.0, 1.25, 1.61, 2.0, 2.5, 3.0, 3.6, 3.8, 4.35, 4.7,
];

export const HEALTHS: readonly number[] = [
  300_000, 450_000, 600_000, 750_000, 960_000, 1_200_000, 1_500_000, 1_860_000, 2_220_000,
  2_580_000, 2_940_000, 3_300_000,
];

/** Damage reduction percentage per defense upgrade level (0-11). */
export const DEFENSES: readonly number[] = [
  10, 40, 55, 62.5, 70, 75, 79, 82, 84, 86, 88, 90,
];

export const AURA_LABELS: readonly string[] = ["Off", "24s", "18s", "12s"];

export const VOLLEY_LABELS: readonly string[] = ["Off", "20s", "15s", "10s"];

export const MAX_STAT_LEVEL = 11;

export const MAX_AURA_LEVEL = 3;

const AURA_NONZERO_BONUS = 5;

const VOLLEY_NONZERO_BONUS = 3;

const HQ_BASE_INDEX_BONUS = 13;

const HQ_CONNECTION_INDEX_BONUS = 6;

const HQ_EXTERNAL_INDEX_BONUS = 2;

export const CONNECTION_BONUS = 0.3;

export const HQ_EXTERNAL_BASE = 1.5;

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

const M_THRESHOLD = 999_500;

const K_THRESHOLD = 999.5;

export function formatStat(value: number): string {
  if (value >= M_THRESHOLD) return `${toFixedHalfEven(value / 1_000_000, 1)}M`;
  if (value >= K_THRESHOLD) return `${toFixedHalfEven(value / 1_000, 0)}k`;
  return toFixedHalfEven(value, 0);
}
