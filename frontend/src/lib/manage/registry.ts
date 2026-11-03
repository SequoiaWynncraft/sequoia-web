import type { AreaAccess, ManageAreaId, ManageBranchKey, ManageCapabilities } from "./types";

export interface AreaGateCopy {
  title: string;
  signinText: string;
  deniedText: string;
  backHref: string;
  backLabel: string;
}

export interface ManageArea {
  id: ManageAreaId;
  label: string;
  /**
   * The org branch whose members hold this area (leadership holds all), or
   * null for a cross-branch area whose own service decides access.
   */
  branch: ManageBranchKey | null;
  /** Landing page, or null while the branch has no console content yet. */
  href: string | null;
  marker: string;
  links: { label: string; href: string }[];
  gate: AreaGateCopy;
}

export interface ManageContentArea extends ManageArea {
  href: string;
}

export const MANAGE_AREAS: readonly ManageArea[] = [
  {
    id: "events",
    label: "Events",
    branch: "events",
    href: "/manage/events",
    marker: "✦",
    links: [{ label: "New event", href: "/manage/events/new" }],
    gate: {
      title: "Events branch only",
      signinText: "Sign in to manage guild events.",
      deniedText: "Events are managed by the Events branch and guild leadership.",
      backHref: "/events",
      backLabel: "Back to events",
    },
  },
  {
    id: "treasury",
    label: "Treasury",
    branch: "treasury",
    href: "/manage/treasury/bagshop",
    marker: "◆",
    links: [{ label: "Bag shop", href: "/manage/treasury/bagshop" }],
    gate: {
      title: "Treasury branch only",
      signinText: "Sign in to manage the bag shop.",
      deniedText: "The bag shop is managed by the Treasury branch, shop staff, and guild leadership.",
      backHref: "/services/bagshop",
      backLabel: "Back to the shop",
    },
  },
  {
    id: "military",
    label: "Military",
    branch: "military",
    href: null,
    marker: "◆",
    links: [],
    gate: {
      title: "Military branch only",
      signinText: "Sign in to use military tools.",
      deniedText: "Military tools are for the Military branch and guild leadership.",
      backHref: "/",
      backLabel: "Back to home",
    },
  },
  {
    id: "community",
    label: "Community",
    branch: "community",
    href: "/manage/community/exports",
    marker: "◆",
    links: [
      { label: "Stats exports", href: "/manage/community/exports" },
      { label: "Posts", href: "/manage/community/posts" },
      { label: "New post", href: "/manage/community/posts/new" },
      { label: "Blog", href: "/manage/community/blog" },
    ],
    gate: {
      title: "Community branch only",
      signinText: "Sign in to use community tools.",
      deniedText: "Community tools are for the Community branch and guild leadership.",
      backHref: "/statistics",
      backLabel: "Back to statistics",
    },
  },
  {
    id: "endGame",
    label: "End-game",
    branch: "end_game",
    href: null,
    marker: "◆",
    links: [],
    gate: {
      title: "End-game branch only",
      signinText: "Sign in to use end-game tools.",
      deniedText: "End-game tools are for the End-game branch and guild leadership.",
      backHref: "/",
      backLabel: "Back to home",
    },
  },
  {
    id: "development",
    label: "Development",
    branch: "development",
    href: "/manage/development/audit",
    marker: "◆",
    links: [{ label: "Audit log", href: "/manage/development/audit" }],
    gate: {
      title: "Development branch only",
      signinText: "Sign in to use development tools.",
      deniedText: "Development tools are for the Development branch and guild leadership.",
      backHref: "/manage",
      backLabel: "Back to manage",
    },
  },
  {
    id: "discord",
    label: "Discord",
    branch: null,
    href: "/manage/discord",
    marker: "✦",
    links: [
      { label: "Messages", href: "/manage/discord" },
      { label: "Welcome messages", href: "/manage/discord/welcome" },
      { label: "Achievement ceremonies", href: "/manage/discord/ceremonies" },
      { label: "Achievements", href: "/manage/discord/achievements" },
    ],
    gate: {
      title: "Discord staff only",
      signinText: "Sign in to manage Discord messages and welcomes.",
      deniedText:
        "Discord messages are managed by Senior Moderators, Treants and higher, guild leadership, and the Community, Military and Development branches.",
      backHref: "/",
      backLabel: "Back to home",
    },
  },
];

function hasContent(area: ManageArea): area is ManageContentArea {
  return area.href !== null;
}

export function contentAreas(): ManageContentArea[] {
  return MANAGE_AREAS.filter(hasContent);
}

export function accessibleAreas(capabilities: ManageCapabilities): ManageContentArea[] {
  return MANAGE_AREAS.filter(hasContent).filter((area) => capabilities[area.id] === "granted");
}

export function firstAccessible(capabilities: ManageCapabilities): ManageContentArea | null {
  return accessibleAreas(capabilities)[0] ?? null;
}

/**
 * The gate state for the console landing when no area is accessible: a
 * missing session or unreachable authority wins over a plain denial.
 */
export function landingAccess(capabilities: ManageCapabilities): Exclude<AreaAccess, "granted"> {
  const values = Object.values(capabilities);
  if (values.includes("signin")) return "signin";
  if (values.includes("unverified")) return "unverified";
  return "denied";
}
