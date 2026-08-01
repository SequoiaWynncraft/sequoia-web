import type { AreaAccess, ManageAreaId, ManageBranchKey, ManageCapabilities } from "./types";

export interface ManageArea {
  id: ManageAreaId;
  label: string;
  /** The org branch whose members hold this area (leadership holds all). */
  branch: ManageBranchKey;
  /** Landing page, or null while the branch has no console content yet. */
  href: string | null;
  /** Section marker: ◆ for org areas, ✦ for event areas (see DESIGN.md). */
  marker: string;
  /** Sub-pages listed under the area in the console sidebar. */
  links: { label: string; href: string }[];
}

/** An area with console content: `href` is narrowed to a real route. */
export interface ManageContentArea extends ManageArea {
  href: string;
}

/**
 * Every management area, in sidebar order - one per org branch. Adding
 * content to a branch means setting its `href` (and links) here plus a page
 * gated on its capability key; the console shell, landing redirect, and
 * navbar visibility all derive from this table.
 */
export const MANAGE_AREAS: readonly ManageArea[] = [
  {
    id: "events",
    label: "Events",
    branch: "events",
    href: "/manage/events",
    marker: "✦",
    links: [{ label: "New event", href: "/manage/events/new" }],
  },
  {
    id: "treasury",
    label: "Treasury",
    branch: "treasury",
    href: "/manage/treasury/bagshop",
    marker: "◆",
    links: [{ label: "Bag shop", href: "/manage/treasury/bagshop" }],
  },
  {
    id: "military",
    label: "Military",
    branch: "military",
    href: null,
    marker: "◆",
    links: [],
  },
  {
    id: "community",
    label: "Community",
    branch: "community",
    href: "/manage/community/exports",
    marker: "◆",
    links: [
      { label: "Stats exports", href: "/manage/community/exports" },
      { label: "Announcements", href: "/manage/community/announcements" },
      { label: "Blog", href: "/manage/community/blog" },
    ],
  },
  {
    id: "endGame",
    label: "End-game",
    branch: "end_game",
    href: null,
    marker: "◆",
    links: [],
  },
  {
    id: "development",
    label: "Development",
    branch: "development",
    href: "/manage/development/audit",
    marker: "◆",
    links: [{ label: "Audit log", href: "/manage/development/audit" }],
  },
];

function hasContent(area: ManageArea): area is ManageContentArea {
  return area.href !== null;
}

/** Areas with console content, regardless of access - the landing's checklist. */
export function contentAreas(): ManageContentArea[] {
  return MANAGE_AREAS.filter(hasContent);
}

/** Granted areas with content, in sidebar order. */
export function accessibleAreas(capabilities: ManageCapabilities): ManageContentArea[] {
  return MANAGE_AREAS.filter(hasContent).filter((area) => capabilities[area.id] === "granted");
}

export function firstAccessible(capabilities: ManageCapabilities): ManageContentArea | null {
  return accessibleAreas(capabilities)[0] ?? null;
}

/**
 * The gate state for the console landing when no area is accessible: a
 * missing session or unreachable authority wins over a plain denial, so the
 * viewer sees the state they can actually act on.
 */
export function landingAccess(capabilities: ManageCapabilities): Exclude<AreaAccess, "granted"> {
  const values = Object.values(capabilities);
  if (values.includes("signin")) return "signin";
  if (values.includes("unverified")) return "unverified";
  return "denied";
}
