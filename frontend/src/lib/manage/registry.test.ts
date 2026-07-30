import { describe, expect, it } from "vitest";

import { MANAGE_AREAS, accessibleAreas, firstAccessible, landingAccess } from "./registry";
import type { ManageCapabilities } from "./types";

const caps = (events: ManageCapabilities["events"], bagshop: ManageCapabilities["bagshop"]) => ({
  events,
  bagshop,
});

describe("registry", () => {
  it("every area has a distinct id and href", () => {
    expect(new Set(MANAGE_AREAS.map((area) => area.id)).size).toBe(MANAGE_AREAS.length);
    expect(new Set(MANAGE_AREAS.map((area) => area.href)).size).toBe(MANAGE_AREAS.length);
  });

  it("filters areas to granted capabilities in registry order", () => {
    expect(accessibleAreas(caps("granted", "granted")).map((area) => area.id)).toEqual([
      "events",
      "bagshop",
    ]);
    expect(accessibleAreas(caps("denied", "granted")).map((area) => area.id)).toEqual(["bagshop"]);
    expect(accessibleAreas(caps("signin", "signin"))).toEqual([]);
  });

  it("firstAccessible follows registry order and null when locked out", () => {
    expect(firstAccessible(caps("granted", "granted"))?.id).toBe("events");
    expect(firstAccessible(caps("denied", "granted"))?.id).toBe("bagshop");
    expect(firstAccessible(caps("denied", "denied"))).toBeNull();
  });

  it("landingAccess prefers the actionable state", () => {
    expect(landingAccess(caps("signin", "signin"))).toBe("signin");
    expect(landingAccess(caps("denied", "unverified"))).toBe("unverified");
    expect(landingAccess(caps("denied", "denied"))).toBe("denied");
  });
});
