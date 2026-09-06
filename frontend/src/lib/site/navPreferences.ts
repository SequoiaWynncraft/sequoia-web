import { SECTIONS, leavesOf, type NavGroup, type NavLeaf, type NavSection } from "$lib/site/nav";

/**
 * Cookie holding this browser's navbar visibility choice. Read in the root
 * layout load so the server renders the menu the viewer already chose, written
 * by the account settings form action. There is no backend record of it - it is
 * a display preference, not account state.
 */
export const NAV_PREFERENCE_COOKIE = "seq_nav_hidden";

/** Stored when the viewer wants everything visible, to keep that distinct from "never chose". */
const NOTHING_HIDDEN = "none";

/** A year, so the choice survives ordinary browsing without a backend. */
export const NAV_PREFERENCE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Marks a section's category switch. A `#` cannot appear in a route path, so
 * these ids can never collide with a page, and the character is a legal cookie
 * octet, so the switch stores alongside the hidden pages.
 */
const CATEGORIES_SUFFIX = "#categories";

/** The switch id for a section's category headings, e.g. `/statistics`. */
export function categoriesToggleId(sectionPath: string): string {
  return `${sectionPath}${CATEGORIES_SUFFIX}`;
}

/**
 * A menu stacks into one column until it carries more entries than this. Past
 * it, the categories come back on their own: a longer list needs the headings
 * to stay scannable, and the columns to stay a sensible height.
 */
export const FLAT_MENU_MAX_ITEMS = 3;

/** The category switch of every section that has groups, so new ones start off. */
function categoriesToggleIds(): string[] {
  return SECTIONS.filter((section) => section.groups).map((section) =>
    categoriesToggleId(section.to),
  );
}

/**
 * Entries kept out of the navbar until a viewer opts back in. Every page stays
 * reachable by URL and through its section's tabs; this only trims the top menu
 * down to the destinations most visitors actually use.
 *
 * Category headings start off for the same reason: the trimmed menu is short
 * enough to read as a single list.
 */
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

/** One switchable navbar entry, identified by its route path. */
export interface NavToggle {
  id: string;
  label: string;
  description?: string;
  /** Sub-heading the entry sits under, for grouped sections like Statistics. */
  group?: string;
}

/** A top-level section and everything switchable underneath it. */
export interface NavToggleSection {
  id: string;
  label: string;
  items: NavToggle[];
  /** Switch for this section's category headings, only if it has groups. */
  categoriesId?: string;
}

/**
 * Every navbar entry a viewer can switch, in menu order, derived from the site
 * registry so a page added to `nav.ts` appears in settings on its own. Groups
 * (Player, Guilds, Global) are not listed separately: a group disappears once
 * all of its entries are hidden.
 */
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

/** Every valid toggle id, used to drop stale or forged cookie entries. */
export function navToggleIds(): string[] {
  return navToggles().flatMap((section) => [
    section.id,
    ...(section.categoriesId ? [section.categoriesId] : []),
    ...section.items.map((item) => item.id),
  ]);
}

/**
 * Read the cookie into the list of hidden entry ids. A missing cookie means the
 * viewer never chose, so the defaults apply; unknown ids are dropped so a
 * renamed route cannot keep hiding something forever.
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

/** Drop a group once every entry under it is hidden. */
function visibleGroups(groups: NavGroup[], hidden: Set<string>): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !hidden.has(item.to)) }))
    .filter((group) => group.items.length > 0);
}

/**
 * The navbar's view of the site tree with the viewer's hidden entries removed,
 * already shaped the way the menu should draw it. Breadcrumbs, tabs, and
 * `pageView` keep working from the full registry, so a hidden page is still a
 * first-class page - it just is not advertised.
 *
 * A section comes back with `groups` when its menu earns category headings and
 * columns, and with a flat `items` list when it does not - so both the dropdown
 * and the mobile panel only have to render whichever one they were handed.
 */
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

/**
 * Whether a grouped menu draws its category headings: because the viewer asked
 * for them, or because it grew past the point where one plain list still reads.
 */
function showsCategories(section: NavSection, hidden: Set<string>): boolean {
  if (!hidden.has(categoriesToggleId(section.to))) return true;
  return leavesOf(section).length > FLAT_MENU_MAX_ITEMS;
}

/** Collapse a grouped menu into one stacked column, in registry order. */
function flatten(section: NavSection): NavSection {
  return { ...section, groups: undefined, items: leavesOf(section) };
}

/** All entry paths under a group card, so an emptied group can be recognised. */
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
 * is hidden, so the grid never offers a landing page with nothing on it.
 *
 * Filtering everything away hands back the original list: someone who opened
 * this overview on purpose should see what is on it, not an empty grid.
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
