import { describe, expect, it } from "vitest";

import { nearestVisibleSection } from "./sectionRail";

describe("section rail scrollspy", () => {
  it("reconciles an interrupted jump to the nearest visible section", () => {
    const visible = new Set(["identity", "activity"]);

    expect(nearestVisibleSection(visible, "goals")).toBe("activity");
  });

  it("keeps an uninterrupted jump target that remains visible", () => {
    const visible = new Set(["activity", "goals"]);

    expect(nearestVisibleSection(visible, "goals")).toBe("goals");
  });
});
