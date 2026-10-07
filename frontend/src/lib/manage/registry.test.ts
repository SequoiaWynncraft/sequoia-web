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
  it("has one area per org branch plus Discord, with distinct ids, branches, and hrefs", () => {
    expect(MANAGE_AREAS.map((area) => area.id)).toEqual([
      "events",
      "treasury",
      "military",
      "community",
      "endGame",
      "development",
      "discord",
    ]);
    const branches = MANAGE_AREAS.map((area) => area.branch).filter((branch) => branch !== null);
    expect(new Set(branches).size).toBe(MANAGE_AREAS.length - 1);
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
      "discord",
    ]);
  });

  it("carries complete gate copy for every area", () => {
    for (const area of MANAGE_AREAS) {
      expect(area.gate.title.length, area.id).toBeGreaterThan(0);
      expect(area.gate.signinText.length, area.id).toBeGreaterThan(0);
      expect(area.gate.deniedText.length, area.id).toBeGreaterThan(0);
      expect(area.gate.backHref.startsWith("/"), area.id).toBe(true);
      expect(area.gate.backLabel.length, area.id).toBeGreaterThan(0);
    }
  });

  it("names every tool as a sub-link under its category", () => {
    const treasury = MANAGE_AREAS.find((area) => area.id === "treasury");
    expect(treasury?.links).toEqual([{ label: "Bag shop", href: "/manage/treasury/bagshop" }]);
    const community = MANAGE_AREAS.find((area) => area.id === "community");
    expect(community?.links.map((link) => link.label)).toEqual([
      "Stats exports",
      "Posts",
      "New post",
      "Blog",
    ]);
    const development = MANAGE_AREAS.find((area) => area.id === "development");
    expect(development?.links).toEqual([
      { label: "Audit log", href: "/manage/development/audit" },
    ]);
  });

  it("gives Discord one ✦ category instead of links repeated under branches", () => {
    const discord = MANAGE_AREAS.find((area) => area.id === "discord");
    expect(discord).toMatchObject({ label: "Discord", marker: "✦", branch: null, href: "/manage/discord" });
    const owners = MANAGE_AREAS.filter((area) =>
      [area.href, ...area.links.map((link) => link.href)].includes("/manage/discord"),
    );
    expect(owners.map((area) => area.id)).toEqual(["discord"]);
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
