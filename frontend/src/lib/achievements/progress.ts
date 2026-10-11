import { isNonNegativeInteger, isRecord } from "$lib/api/guards";

/** One step on a category ladder, e.g. Gold at 100 wars or level 110. */
export interface AchievementStep {
  label: string;
  at: number;
}

export interface AchievementCategory {
  key: string;
  kind: string;
  label: string;
  /** Null with `unknown` means the source has no observation yet, never zero. */
  value: number | null;
  unknown: boolean;
  level: number;
  tier_label: string | null;
  next: AchievementStep | null;
  ladder: AchievementStep[];
}

export interface AchievementAward {
  award_id: string | null;
  key: string;
  label: string;
  /** Null means the award was recorded before earn times were tracked. */
  earned_at: string | null;
}

export interface AchievementProgress {
  player: { uuid: string; username: string };
  eligible: boolean;
  categories: AchievementCategory[];
  history: AchievementAward[];
}

export interface AchievementGroup {
  kind: string;
  label: string;
  categories: AchievementCategory[];
}

const GROUP_LABELS: Record<string, string> = {
  raid: "Raids",
  war: "Guild wars",
  profession: "Professions",
  role: "Roles",
  badge: "Badges",
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function parseStep(value: unknown): AchievementStep | null {
  if (!isRecord(value) || !isString(value.label) || !isNonNegativeInteger(value.at)) return null;
  return { label: value.label, at: value.at };
}

function parseCategory(value: unknown): AchievementCategory | null {
  if (!isRecord(value) || !isString(value.key) || !isString(value.kind) || !isString(value.label)) return null;
  const unknown = value.unknown === true || value.value === null;
  if (!unknown && !isNonNegativeInteger(value.value)) return null;
  const ladder = Array.isArray(value.ladder) ? value.ladder.map(parseStep) : [];
  if (ladder.some((step) => step === null)) return null;
  const next = value.next === null || value.next === undefined ? null : parseStep(value.next);
  if (value.next && !next) return null;
  return {
    key: value.key,
    kind: value.kind,
    label: value.label,
    value: unknown ? null : (value.value as number),
    unknown,
    level: isNonNegativeInteger(value.level) ? value.level : 0,
    tier_label: isString(value.tier_label) && value.tier_label ? value.tier_label : null,
    next,
    ladder: ladder as AchievementStep[],
  };
}

function parseAward(value: unknown): AchievementAward | null {
  if (!isRecord(value) || !isString(value.key) || !isString(value.label)) return null;
  const earnedAt = isString(value.earned_at) && !Number.isNaN(Date.parse(value.earned_at)) ? value.earned_at : null;
  return {
    award_id: isString(value.award_id) ? value.award_id : null,
    key: value.key,
    label: value.label,
    earned_at: earnedAt,
  };
}

/** Validates the Sierra response. Malformed rows are dropped; a malformed envelope is null. */
export function parseAchievementProgress(value: unknown): AchievementProgress | null {
  if (!isRecord(value) || !isRecord(value.player) || !isString(value.player.uuid) || !isString(value.player.username)) return null;
  if (!Array.isArray(value.categories) || !Array.isArray(value.history)) return null;
  return {
    player: { uuid: value.player.uuid, username: value.player.username },
    eligible: value.eligible !== false,
    categories: value.categories.map(parseCategory).filter((item): item is AchievementCategory => item !== null),
    history: value.history.map(parseAward).filter((item): item is AchievementAward => item !== null),
  };
}

/** Groups rows by kind in server order. */
export function achievementGroups(categories: AchievementCategory[]): AchievementGroup[] {
  const groups = new Map<string, AchievementGroup>();
  for (const category of categories) {
    let group = groups.get(category.kind);
    if (!group) {
      const label = GROUP_LABELS[category.kind] ?? category.kind.charAt(0).toUpperCase() + category.kind.slice(1);
      group = { kind: category.kind, label, categories: [] };
      groups.set(category.kind, group);
    }
    group.categories.push(category);
  }
  return [...groups.values()];
}

/** Share of the way from the last reached step to the next one, 0 to 1. Null when there is nothing to fill. */
export function achievementFraction(category: AchievementCategory): number | null {
  if (category.unknown || category.value === null) return null;
  if (!category.next) return category.ladder.length > 0 ? 1 : null;
  const value = category.value;
  const floor = category.ladder.reduce((best, step) => (step.at <= value && step.at > best ? step.at : best), 0);
  const span = category.next.at - floor;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (value - floor) / span));
}

const number = new Intl.NumberFormat("en");

/** Current reading: a count, a profession level or Unknown. */
export function achievementValue(category: AchievementCategory): string {
  if (category.unknown || category.value === null) return "Unknown";
  if (category.kind === "profession") return `Level ${category.value}`;
  return number.format(category.value);
}

/** Current tier, or the profession milestone reached. */
export function achievementCurrent(category: AchievementCategory): string {
  if (category.tier_label) return category.tier_label;
  return category.kind === "profession" ? "No milestone" : "No tier";
}

export function achievementNext(category: AchievementCategory): string {
  if (!category.next) return category.ladder.length > 0 ? "Complete" : "";
  if (category.kind === "profession") return `Next: level ${category.next.at}`;
  return `Next: ${category.next.label} at ${number.format(category.next.at)}`;
}

/** Newest first. Awards recorded before tracking have no time and follow the dated ones. */
export function achievementHistory(history: AchievementAward[]): AchievementAward[] {
  return history
    .map((award, index) => ({ award, index, time: award.earned_at ? Date.parse(award.earned_at) : null }))
    .sort((a, b) => {
      if (a.time === null || b.time === null) return a.time === b.time ? a.index - b.index : a.time === null ? 1 : -1;
      return b.time - a.time || a.index - b.index;
    })
    .map(({ award }) => award);
}

const dateFormat = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export function achievementEarned(award: AchievementAward): string {
  return award.earned_at ? dateFormat.format(new Date(award.earned_at)) : "Recorded";
}
