import type { AreaAccess, ManageAreaId, ManageCapabilities } from "./types";

export interface ManageArea {
  id: ManageAreaId;
  label: string;
  href: string;
  /** Section marker: ◆ for org areas, ✦ for event areas (see DESIGN.md). */
  marker: string;
  /** Sub-pages listed under the area in the console sidebar. */
  links: { label: string; href: string }[];
}

/**
 * Every management area, in sidebar order. Adding an area means one entry
 * here plus one capability key in ManageCapabilities - the console shell,
 * landing redirect, and navbar visibility all derive from this table.
 */
export const MANAGE_AREAS: readonly ManageArea[] = [
  {
    id: "events",
    label: "Events",
    href: "/manage/events",
    marker: "✦",
    links: [
      { label: "New event", href: "/manage/events/new" },
      { label: "Audit log", href: "/manage/events/audit" },
    ],
  },
  {
    id: "bagshop",
    label: "Bag shop",
    href: "/manage/bagshop",
    marker: "◆",
    links: [],
  },
];

export function accessibleAreas(capabilities: ManageCapabilities): ManageArea[] {
  return MANAGE_AREAS.filter((area) => capabilities[area.id] === "granted");
}

export function firstAccessible(capabilities: ManageCapabilities): ManageArea | null {
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
