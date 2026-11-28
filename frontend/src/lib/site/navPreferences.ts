import { SECTIONS, leavesOf, type NavGroup, type NavLeaf, type NavSection } from "#lib/site/nav.js";

export const NAV_PREFERENCE_COOKIE = "seq_nav_hidden";

const NOTHING_HIDDEN = "none";

export const NAV_PREFERENCE_MAX_AGE = 60 * 60 * 24 * 365;

const CATEGORIES_SUFFIX = "#categories";

export function categoriesToggleId(sectionPath: string): string {
  return `${sectionPath}${CATEGORIES_SUFFIX}`;
}

export const FLAT_MENU_MAX_ITEMS = 3;

function categoriesToggleIds(): string[] {
  return SECTIONS.filter((section) => section.groups).map((section) =>
    categoriesToggleId(section.to),
  );
}

export const DEFAULT_HIDDEN_NAV: readonly string[] = [
  "/news",
  "/statistics/player/raids",
  "/statistics/player/activity",
  "/statistics/guilds/war",
  "/statistics/global/rankings",
  "/statistics/global/guilds",
  "/statistics/global/players",
  "/services/announcements",
  "/services/tower-calc",
  ...categoriesToggleIds(),
];

export interface NavToggle {
  id: string;
  label: string;
  description?: string;
  group?: string;
}

export interface NavToggleSection {
  id: string;
  label: string;
  items: NavToggle[];
  categoriesId?: string;
}

export function navToggles(): NavToggleSection[] {
  return SECTIONS.map((section) => ({
    id: section.to,
    label: section.label,
    categoriesId: section.groups ? categoriesToggleId(section.to) : undefined,
    items: [
      ...(section.items ?? []).map((item) => ({
        id: item.to,
        label: item.label,
        description: item.description,
      })),
      ...(section.groups ?? []).flatMap((group) =>
        group.items.map((item) => ({
          id: item.to,
          label: item.label,
          description: item.description,
          group: group.label,
        })),
      ),
    ],
  }));
}

export function navToggleIds(): string[] {
  return navToggles().flatMap((section) => [
    section.id,
    ...(section.categoriesId ? [section.categoriesId] : []),
    ...section.items.map((item) => item.id),
  ]);
}

/**
 * Read the cookie into the list of hidden entry ids. A missing cookie means the
 * viewer never chose, so the defaults apply; unknown ids are dropped.
 */
export function parseHiddenNav(raw: string | null | undefined): string[] {
  if (!raw) return [...DEFAULT_HIDDEN_NAV];
  if (raw === NOTHING_HIDDEN) return [];
  const known = new Set(navToggleIds());
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => known.has(id));
}

/** Serialize hidden ids for the cookie, keeping "show everything" distinct from "never chose". */
export function serializeHiddenNav(hidden: Iterable<string>): string {
  const known = new Set(navToggleIds());
  const ids = [...new Set(hidden)].filter((id) => known.has(id));
  return ids.length ? ids.join(",") : NOTHING_HIDDEN;
}

function visibleGroups(groups: NavGroup[], hidden: Set<string>): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !hidden.has(item.to)) }))
    .filter((group) => group.items.length > 0);
}

export function visibleSections(hidden: Iterable<string>): NavSection[] {
  const hiddenIds = new Set(hidden);
  return SECTIONS.filter((section) => !hiddenIds.has(section.to)).map((section) => {
    const items = section.items?.filter((item) => !hiddenIds.has(item.to));
    const groups = section.groups ? visibleGroups(section.groups, hiddenIds) : undefined;
    const menu: NavSection = {
      ...section,
      items: items?.length ? items : undefined,
      groups: groups?.length ? groups : undefined,
    };
    return menu.groups && !showsCategories(menu, hiddenIds) ? flatten(menu) : menu;
  });
}

function showsCategories(section: NavSection, hidden: Set<string>): boolean {
  if (!hidden.has(categoriesToggleId(section.to))) return true;
  return leavesOf(section).length > FLAT_MENU_MAX_ITEMS;
}

function flatten(section: NavSection): NavSection {
  return { ...section, groups: undefined, items: leavesOf(section) };
}

function groupItemPaths(path: string): string[] | null {
  for (const section of SECTIONS) {
    const group = section.groups?.find((candidate) => candidate.to === path);
    if (group) return group.items.map((item) => item.to);
  }
  return null;
}

/**
 * Filter an overview page's card grid the same way as the navbar. A card that
 * points at a group (`/statistics/global`) also goes when every page under it
 * is hidden.
 * Filtering everything away hands back the original list.
 */
export function visibleCards(cards: NavLeaf[], hidden: Iterable<string>): NavLeaf[] {
  const hiddenIds = new Set(hidden);
  const visible = cards.filter((card) => {
    if (hiddenIds.has(card.to)) return false;
    const items = groupItemPaths(card.to);
    return items === null || items.some((item) => !hiddenIds.has(item));
  });
  return visible.length > 0 ? visible : cards;
}
