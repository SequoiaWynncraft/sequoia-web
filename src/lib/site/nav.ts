import type { IconName } from "$lib/icons";

export interface NavLeaf {
  label: string;
  to: string;
  icon?: IconName;
  description?: string;
  kicker?: string;
  title?: string;
  lead?: string;
  placeholder?: string;
  cta?: string;
  flagship?: boolean;
}

export interface NavGroup {
  label: string;
  to: string;
  icon?: IconName;
  description?: string;
  kicker?: string;
  title?: string;
  lead?: string;
  placeholder?: string;
  items: NavLeaf[];
}

export interface NavSection {
  label: string;
  to: string;
  icon?: IconName;
  description?: string;
  kicker?: string;
  title?: string;
  lead?: string;
  placeholder?: string;
  groups?: NavGroup[];
  items?: NavLeaf[];
}

export interface Crumb {
  label: string;
  to?: string;
}

export interface PageView {
  label: string;
  to: string;
  icon?: IconName;
  description?: string;
  kicker: string;
  title: string;
  lead?: string;
  placeholder?: string;
  crumbs: Crumb[];
  tabs: NavLeaf[];
  cards: NavLeaf[];
}

export const SECTIONS: NavSection[] = [
  {
    label: "News",
    to: "/news",
    icon: "document",
    kicker: "News",
    title: "Public Announcements",
    lead: "Latest news and public updates from Sequoia.",
    placeholder: "News",
  },
  {
    label: "Statistics",
    to: "/statistics",
    icon: "chart",
    kicker: "Statistics",
    title: "Stats & Standings",
    lead: "Browse player and guild statistics for Sequoia.",
    groups: [
      {
        label: "Player",
        to: "/statistics/player",
        icon: "users",
        description: "Per-member raids, activity, and playercards.",
        kicker: "Statistics · Player",
        title: "Player Statistics",
        lead: "Individual member stats: raids, activity, and playercards.",
        items: [
          {
            label: "Raids",
            to: "/statistics/player/raids",
            icon: "raid",
            description: "Per-player raid clears, completions, and best times.",
            kicker: "Player",
            title: "Raids",
            lead: "Per-player raid clears, completions, and best times.",
            placeholder: "Player Raids",
          },
          {
            label: "Activity",
            to: "/statistics/player/activity",
            icon: "online",
            description: "Playtime, contributed XP, and session history.",
            kicker: "Player",
            title: "Activity",
            lead: "Playtime, contributed XP, and session history.",
            placeholder: "Player Activity",
          },
          {
            label: "Playercard",
            to: "/statistics/player/playercard",
            icon: "clipboard",
            description: "A shareable profile summary for any member.",
            kicker: "Player",
            title: "Playercard",
            lead: "A shareable profile summary for any member.",
            placeholder: "Playercard",
          },
        ],
      },
      {
        label: "Guilds",
        to: "/statistics/guilds",
        icon: "trophy",
        description: "War, raid, and ranking stats for the whole guild.",
        kicker: "Statistics · Guilds",
        title: "Guild Statistics",
        lead: "Guild-wide war, raid, and ranking statistics.",
        items: [
          {
            label: "War",
            to: "/statistics/guilds/war",
            icon: "war",
            description: "Territory wars, win rate, and battle history.",
            kicker: "Guilds",
            title: "War",
            lead: "Territory wars, win rate, and battle history.",
            placeholder: "Guild War",
          },
          {
            label: "Raid",
            to: "/statistics/guilds/raid",
            icon: "sword",
            description: "Guild-wide raid totals and weekly leaderboards.",
            kicker: "Guilds",
            title: "Raid",
            lead: "Guild-wide raid totals and weekly leaderboards.",
            placeholder: "Guild Raid",
          },
          {
            label: "Rankings",
            to: "/statistics/guilds/rankings",
            icon: "trophy",
            description: "Season standings against rival guilds.",
            kicker: "Guilds",
            title: "Rankings",
            lead: "Season standings against rival guilds.",
            placeholder: "Guild Rankings",
          },
        ],
      },
    ],
  },
  {
    label: "Services",
    to: "/services",
    icon: "bag",
    kicker: "Services",
    title: "Community",
    lead: "Sequoia services: bagshop, announcements, and requests.",
    items: [
      {
        label: "Bagshop",
        to: "/services/bagshop",
        icon: "bag",
        description: "Marketplace for raid crafterbags.",
        kicker: "Services",
        title: "Bagshop",
        lead: "Marketplace for crafter bags from raids.",
        placeholder: "Bagshop",
        cta: "Visit",
        flagship: true,
      },
      {
        label: "Announcements",
        to: "/services/announcements",
        icon: "document",
        description: "Guild-internal announcements for members.",
        kicker: "Services",
        title: "Announcements",
        lead: "Guild-internal announcements for members.",
        placeholder: "Announcements",
        cta: "Read",
      },
      {
        label: "Requests",
        to: "/services/requests",
        icon: "clipboard",
        description: "Request Aspects and Guild Tomes here.",
        kicker: "Services",
        title: "Requests",
        lead: "Request Aspects and Tomes here.",
        placeholder: "Requests",
        cta: "Request",
      },
    ],
  },
];

const EXTRA_PAGES: (NavLeaf & { parent?: string })[] = [
  {
    label: "Contact",
    to: "/services/contact",
    kicker: "Services",
    title: "Contact",
    lead: "Reach the Branchmasters directly.",
    placeholder: "Contact",
    parent: "/services",
  },
  {
    label: "Privacy Policy",
    to: "/legal",
    kicker: "Legal",
    title: "Privacy Policy",
  },
];

export function leavesOf(section: NavSection): NavLeaf[] {
  if (section.items) return section.items;
  if (section.groups) return section.groups.flatMap((g) => g.items);
  return [];
}

export function tabsFor(path: string): NavLeaf[] {
  for (const s of SECTIONS) {
    if (s.items && (s.to === path || s.items.some((item) => item.to === path))) return s.items;
    if (s.groups) {
      const g = s.groups.find((g) => g.to === path || g.items.some((item) => item.to === path));
      if (g) return g.items;
    }
  }
  return [];
}

export function cardsFor(path: string): NavLeaf[] {
  const section = SECTIONS.find((s) => s.to === path);
  if (!section) return [];
  if (section.items) return section.items;
  if (section.groups) {
    return section.groups.map((g) => ({
      label: g.label,
      to: g.to,
      icon: g.icon,
      description: g.description,
      kicker: g.kicker,
      title: g.title,
      lead: g.lead,
    }));
  }
  return [];
}

export function homepageServices(): NavLeaf[] {
  return cardsFor("/services");
}

export function pageView(path: string): PageView {
  const match = findPage(path);
  if (!match) throw new Error(`Unknown site page: ${path}`);
  const parent = parentPathFor(path);
  return {
    label: match.page.label,
    to: match.page.to,
    icon: match.page.icon,
    description: match.page.description,
    kicker: match.page.kicker ?? match.parent?.label ?? match.page.label,
    title: match.page.title ?? match.page.label,
    lead: match.page.lead,
    placeholder: match.page.placeholder,
    crumbs: crumbsFor(path),
    tabs: parent ? tabsFor(parent) : tabsFor(match.page.to),
    cards: cardsFor(match.page.to).length > 0 ? cardsFor(match.page.to) : tabsFor(match.page.to),
  };
}

function crumbsFor(path: string): Crumb[] {
  const match = findPage(path);
  if (!match) return [{ label: "Home", to: "/" }];
  const crumbs: Crumb[] = [{ label: "Home", to: "/" }];
  if (match.section && match.section.to !== match.page.to) {
    crumbs.push({ label: match.section.label, to: match.section.to });
  }
  if (match.group && match.group.to !== match.page.to) {
    crumbs.push({ label: match.group.label, to: match.group.to });
  }
  crumbs.push({ label: match.page.label });
  return crumbs;
}

function parentPathFor(path: string): string | undefined {
  const match = findPage(path);
  if (!match) return undefined;
  if ("parent" in match.page && typeof match.page.parent === "string") return match.page.parent;
  if (match.group && match.group.to !== match.page.to) return match.group.to;
  if (match.section && match.section.to !== match.page.to) return match.section.to;
  return undefined;
}

function findPage(path: string):
  | { page: NavSection | NavGroup | (NavLeaf & { parent?: string }); section?: NavSection; group?: NavGroup; parent?: NavSection | NavGroup }
  | undefined {
  for (const section of SECTIONS) {
    if (section.to === path) return { page: section, section };
    if (section.groups) {
      for (const group of section.groups) {
        if (group.to === path) return { page: group, section, group, parent: section };
        const item = group.items.find((candidate) => candidate.to === path);
        if (item) return { page: item, section, group, parent: group };
      }
    }
    const item = section.items?.find((candidate) => candidate.to === path);
    if (item) return { page: item, section, parent: section };
  }
  const extra = EXTRA_PAGES.find((candidate) => candidate.to === path);
  if (!extra) return undefined;
  const parentMatch = extra.parent ? findPage(extra.parent) : undefined;
  return {
    page: extra,
    section: parentMatch?.section,
    group: parentMatch?.group,
    parent: parentMatch?.page,
  };
}
