import type { IconName } from "$lib/icons";

export interface NavLeaf {
  label: string;
  to: string;
  icon?: IconName;
  description?: string;
}

export interface NavGroup {
  label: string;
  to: string;
  icon?: IconName;
  items: NavLeaf[];
}

export interface NavSection {
  label: string;
  to: string;
  icon?: IconName;
  groups?: NavGroup[];
  items?: NavLeaf[];
}

export const SECTIONS: NavSection[] = [
  {
    label: "News",
    to: "/news",
    icon: "document",
  },
  {
    label: "Statistics",
    to: "/statistics",
    icon: "chart",
    groups: [
      {
        label: "Player",
        to: "/statistics/player",
        icon: "users",
        items: [
          { label: "Raids", to: "/statistics/player/raids", icon: "raid", description: "Per-player raid clears, completions, and best times." },
          { label: "Activity", to: "/statistics/player/activity", icon: "online", description: "Playtime, contributed XP, and session history." },
          { label: "Playercard", to: "/statistics/player/playercard", icon: "clipboard", description: "A shareable profile summary for any member." },
        ],
      },
      {
        label: "Guilds",
        to: "/statistics/guilds",
        icon: "trophy",
        items: [
          { label: "War", to: "/statistics/guilds/war", icon: "war", description: "Territory wars, win rate, and battle history." },
          { label: "Raid", to: "/statistics/guilds/raid", icon: "sword", description: "Guild-wide raid totals and weekly leaderboards." },
          { label: "Rankings", to: "/statistics/guilds/rankings", icon: "trophy", description: "Season standings against rival guilds." },
        ],
      },
    ],
  },
  {
    label: "Services",
    to: "/services",
    icon: "bag",
    items: [
      { label: "Bagshop", to: "/services/bagshop", icon: "bag", description: "Marketplace for raid crafterbags." },
      { label: "Announcements", to: "/services/announcements", icon: "document", description: "Guild-internal announcements for members." },
      { label: "Contact", to: "/services/contact", icon: "mail", description: "Reach the Branchmasters directly." },
      { label: "Requests", to: "/services/requests", icon: "clipboard", description: "Request Aspects and Guild Tomes here." },
    ],
  },
];

export function leavesOf(section: NavSection): NavLeaf[] {
  if (section.items) return section.items;
  if (section.groups) return section.groups.flatMap((g) => g.items);
  return [];
}

export function tabsFor(path: string): NavLeaf[] {
  for (const s of SECTIONS) {
    if (s.items && s.to === path) return s.items;
    if (s.groups) {
      const g = s.groups.find((g) => g.to === path);
      if (g) return g.items;
    }
  }
  return [];
}
