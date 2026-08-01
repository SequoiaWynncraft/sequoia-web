import { describe, expect, it } from "vitest";

import {
  MANAGE_AREAS,
  accessibleAreas,
  contentAreas,
  firstAccessible,
  landingAccess,
} from "./registry";
import type { AreaAccess, ManageCapabilities } from "./types";

function caps(overrides: Partial<ManageCapabilities> = {}): ManageCapabilities {
  const base = {} as ManageCapabilities;
  for (const area of MANAGE_AREAS) base[area.id] = "denied" as AreaAccess;
  return { ...base, ...overrides };
}

describe("registry", () => {
  it("has one area per org branch with distinct ids, branches, and hrefs", () => {
    expect(MANAGE_AREAS.map((area) => area.id)).toEqual([
      "events",
      "treasury",
      "military",
      "community",
      "endGame",
      "development",
    ]);
    expect(new Set(MANAGE_AREAS.map((area) => area.branch)).size).toBe(MANAGE_AREAS.length);
    const hrefs = MANAGE_AREAS.map((area) => area.href).filter((href) => href !== null);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps contentless branches out of the accessible list even when granted", () => {
    const all = caps({ events: "granted", treasury: "granted", military: "granted" });
    expect(accessibleAreas(all).map((area) => area.id)).toEqual(["events", "treasury"]);
  });

  it("contentAreas lists only areas with a landing route", () => {
    expect(contentAreas().every((area) => area.href !== null)).toBe(true);
    expect(contentAreas().map((area) => area.id)).toEqual([
      "events",
      "treasury",
      "community",
      "development",
    ]);
  });

  it("names every tool as a sub-link under its category", () => {
    const treasury = MANAGE_AREAS.find((area) => area.id === "treasury");
    expect(treasury?.links).toEqual([{ label: "Bag shop", href: "/manage/treasury/bagshop" }]);
    const community = MANAGE_AREAS.find((area) => area.id === "community");
    expect(community?.links.map((link) => link.label)).toEqual([
      "Stats exports",
      "Announcements",
      "Blog",
    ]);
    const development = MANAGE_AREAS.find((area) => area.id === "development");
    expect(development?.links).toEqual([
      { label: "Audit log", href: "/manage/development/audit" },
    ]);
  });

  it("firstAccessible follows registry order and null when locked out", () => {
    expect(firstAccessible(caps({ events: "granted", treasury: "granted" }))?.id).toBe("events");
    expect(firstAccessible(caps({ treasury: "granted" }))?.id).toBe("treasury");
    expect(firstAccessible(caps())).toBeNull();
  });

  it("landingAccess prefers the actionable state", () => {
    expect(landingAccess(caps({ events: "signin", treasury: "signin" }))).toBe("signin");
    expect(landingAccess(caps({ treasury: "unverified" }))).toBe("unverified");
    expect(landingAccess(caps())).toBe("denied");
  });
});
