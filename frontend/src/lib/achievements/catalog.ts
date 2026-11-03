import { isNonNegativeInteger, isRecord } from "#lib/api/guards.js";
import { GROUP_LABELS } from "./progress";

export interface CatalogMilestone {
  id: string;
  at: number;
  label: string;
  tier: string;
}

export interface CatalogCategory {
  key: string;
  kind: string;
  enabled: boolean;
  label: string;
  milestones: CatalogMilestone[];
}

export interface CatalogLimits {
  name_max: number;
  label_max: number;
  milestones_max: number;
  count_max: number;
  level_max: number;
}

export interface CatalogResponse {
  catalog: { version: number; categories: CatalogCategory[] };
  defaults: CatalogCategory[];
  tiers: { id: string; label: string }[];
  limits: CatalogLimits;
  stories: { id: string; label: string; ready: boolean }[];
  updated_by: string | null;
  updated_at: string | null;
}

export interface CatalogGroup {
  kind: string;
  label: string;
  categories: CatalogCategory[];
}

const LADDER_KINDS = new Set(["raid", "war", "profession"]);

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function positive(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function parseMilestone(value: unknown): CatalogMilestone | null {
  if (!isRecord(value) || !isString(value.id) || !isNonNegativeInteger(value.at) || !isString(value.label) || !isString(value.tier)) return null;
  return { id: value.id, at: value.at, label: value.label, tier: value.tier };
}

function parseCategory(value: unknown): CatalogCategory | null {
  if (!isRecord(value) || !isString(value.key) || !value.key || !isString(value.kind) || typeof value.enabled !== "boolean"
    || !isString(value.label) || !Array.isArray(value.milestones)) return null;
  const milestones = value.milestones.map(parseMilestone);
  if (milestones.some((item) => item === null)) return null;
  return { key: value.key, kind: value.kind, enabled: value.enabled, label: value.label, milestones: milestones as CatalogMilestone[] };
}

function parseCategories(value: unknown): CatalogCategory[] | null {
  if (!Array.isArray(value)) return null;
  const categories = value.map(parseCategory);
  return categories.some((item) => item === null) ? null : categories as CatalogCategory[];
}

export function parseCatalogResponse(value: unknown): CatalogResponse | null {
  if (!isRecord(value) || !isRecord(value.catalog) || !isNonNegativeInteger(value.catalog.version) || !isRecord(value.limits)) return null;
  const categories = parseCategories(value.catalog.categories);
  const defaults = parseCategories(value.defaults);
  const limits = value.limits;
  if (!categories || !defaults || !Array.isArray(value.tiers)) return null;
  if (!positive(limits.name_max) || !positive(limits.label_max) || !positive(limits.milestones_max)
    || !positive(limits.count_max) || !positive(limits.level_max)) return null;
  const tiers = value.tiers.filter((tier): tier is { id: string; label: string } => isRecord(tier) && isString(tier.id) && isString(tier.label));
  if (tiers.length === 0 || tiers.length !== value.tiers.length) return null;
  const stories = Array.isArray(value.stories)
    ? value.stories.filter((story): story is CatalogResponse["stories"][number] => isRecord(story) && isString(story.id) && isString(story.label) && typeof story.ready === "boolean")
    : [];
  return {
    catalog: { version: value.catalog.version, categories },
    defaults,
    tiers: tiers.map(({ id, label }) => ({ id, label })),
    limits: {
      name_max: limits.name_max, label_max: limits.label_max, milestones_max: limits.milestones_max,
      count_max: limits.count_max, level_max: limits.level_max,
    },
    stories: stories.map(({ id, label, ready }) => ({ id, label, ready })),
    updated_by: isString(value.updated_by) ? value.updated_by : null,
    updated_at: isString(value.updated_at) ? value.updated_at : null,
  };
}

export function catalogGroups(categories: CatalogCategory[]): CatalogGroup[] {
  const groups: CatalogGroup[] = [];
  for (const category of categories) {
    let group = groups.find((item) => item.kind === category.kind);
    if (!group) {
      group = { kind: category.kind, label: GROUP_LABELS[category.kind] ?? category.kind, categories: [] };
      groups.push(group);
    }
    group.categories.push(category);
  }
  return groups;
}

export function catalogEditable(kind: string): { label: boolean; milestones: boolean } {
  return { label: LADDER_KINDS.has(kind) || kind === "role", milestones: LADDER_KINDS.has(kind) };
}

export function catalogThresholdMax(kind: string, limits: CatalogLimits): number {
  return kind === "profession" ? limits.level_max : limits.count_max;
}

function characters(value: string): number {
  return [...value].length;
}

export function categoryIssue(category: CatalogCategory, limits: CatalogLimits, tiers: CatalogResponse["tiers"]): string | null {
  const editable = catalogEditable(category.kind);
  if (editable.label && (!category.label.trim() || characters(category.label) > limits.name_max)) {
    return `Use a name of 1 to ${limits.name_max} characters.`;
  }
  if (!editable.milestones) return null;
  const { milestones } = category;
  if (milestones.length === 0) return "Add at least one milestone.";
  if (milestones.length > limits.milestones_max) return `Use at most ${limits.milestones_max} milestones.`;
  const max = catalogThresholdMax(category.kind, limits);
  if (milestones.some(({ at }) => !Number.isInteger(at) || at < 1 || at > max)) {
    return `Use whole-number thresholds from 1 to ${new Intl.NumberFormat("en").format(max)}.`;
  }
  if (milestones.some(({ label }) => !label.trim() || characters(label) > limits.label_max)) {
    return `Use milestone labels of 1 to ${limits.label_max} characters.`;
  }
  if (milestones.some(({ tier }) => !tiers.some(({ id }) => id === tier))) return "Choose a style for every milestone.";
  if (milestones.some((item, index) => index > 0 && item.at <= milestones[index - 1].at)) return "Thresholds must increase from top to bottom.";
  return null;
}

export function catalogIssue(categories: CatalogCategory[], limits: CatalogLimits, tiers: CatalogResponse["tiers"]): string | null {
  for (const category of categories) {
    const issue = categoryIssue(category, limits, tiers);
    if (issue) return `${category.label.trim() || category.key}: ${issue}`;
  }
  return null;
}

export function canSortMilestones(milestones: CatalogMilestone[]): boolean {
  return milestones.every(({ at }) => Number.isInteger(at))
    && milestones.some((item, index) => index > 0 && item.at < milestones[index - 1].at);
}

export function sortMilestones(milestones: CatalogMilestone[]): CatalogMilestone[] {
  return milestones.map((item) => ({ ...item })).sort((a, b) => a.at - b.at);
}

export function nextMilestone(category: CatalogCategory, limits: CatalogLimits, tiers: CatalogResponse["tiers"]): CatalogMilestone {
  const last = category.milestones.at(-1);
  const max = catalogThresholdMax(category.kind, limits);
  const at = last && Number.isInteger(last.at) ? Math.min(Math.max(last.at + 1, 1), max) : 1;
  const tier = tiers.find(({ id }) => id === last?.tier) ?? tiers[0];
  const label = category.kind === "profession" ? `Level ${at}` : tier?.label ?? "";
  return { id: "", at, label, tier: tier?.id ?? "" };
}

export function resetCategory(category: CatalogCategory, defaults: CatalogCategory[]): CatalogCategory | null {
  const seeded = defaults.find(({ key }) => key === category.key);
  return seeded ? { ...structuredClone(seeded), enabled: category.enabled } : null;
}

export function sameCategory(a: CatalogCategory | undefined, b: CatalogCategory | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function milestonePreviewable(saved: CatalogCategory | undefined, category: CatalogCategory, milestone: CatalogMilestone): boolean {
  if (!milestone.id || !saved || saved.label !== category.label) return false;
  const stored = saved.milestones.find(({ id }) => id === milestone.id);
  return !!stored && JSON.stringify(stored) === JSON.stringify(milestone);
}

export function catalogBody(version: number, categories: CatalogCategory[]): { version: number; categories: CatalogCategory[] } {
  return { version, categories };
}
