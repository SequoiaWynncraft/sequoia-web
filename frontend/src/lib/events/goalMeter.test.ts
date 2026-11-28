import { describe, expect, it } from "vitest";

import { COMPACT_FROM, milestoneWindow } from "./goalMeter";
import type { GoalMilestone } from "./types";

function ladder(count: number): GoalMilestone[] {
  return Array.from({ length: count }, (_, index) => ({
    at: (index + 1) * 10,
    unlock: `Tier ${index + 1}`,
  }));
}

const at = (raids: number) => (target: number) => raids >= target;

describe("milestoneWindow", () => {
  it("returns short ladders whole, so existing goals render unchanged", () => {
    const short = ladder(COMPACT_FROM - 1);
    const result = milestoneWindow(short, at(50));

    expect(result.compact).toBe(false);
    expect(result.visible).toBe(short);
    expect(result.hiddenBefore).toBe(0);
    expect(result.hiddenAfter).toBe(0);
  });

  it("compacts at the threshold, keeping one cleared tier and the next few", () => {
    const result = milestoneWindow(ladder(COMPACT_FROM), at(50));

    expect(result.compact).toBe(true);
    expect(result.visible.map((tier) => tier.at)).toEqual([50, 60, 70]);
    expect(result.hiddenBefore).toBe(4);
    expect(result.hiddenAfter).toBe(COMPACT_FROM - 7);
  });

  it("shows the bottom of the ladder when nothing is reached yet", () => {
    const result = milestoneWindow(ladder(64), at(0));

    expect(result.visible.map((tier) => tier.at)).toEqual([10, 20, 30]);
    expect(result.hiddenBefore).toBe(0);
    expect(result.hiddenAfter).toBe(61);
  });

  it("slides to the top of the ladder once every tier is cleared", () => {
    const result = milestoneWindow(ladder(64), at(10_000));

    expect(result.visible.map((tier) => tier.at)).toEqual([620, 630, 640]);
    expect(result.hiddenBefore).toBe(61);
    expect(result.hiddenAfter).toBe(0);
  });

  it("treats unknown progress as nothing reached", () => {
    const result = milestoneWindow(ladder(64), () => false);

    expect(result.visible.map((tier) => tier.at)).toEqual([10, 20, 30]);
    expect(result.hiddenBefore).toBe(0);
  });

  it("never drops a tier: visible plus hidden is always the full ladder", () => {
    for (const reachedAt of [0, 45, 200, 639, 640, 5_000]) {
      const result = milestoneWindow(ladder(64), at(reachedAt));
      expect(result.visible.length + result.hiddenBefore + result.hiddenAfter).toBe(64);
    }
  });
});
