import { describe, expect, it } from "vitest";

import { finalRotationDeg, wedgeAtPointer, wheelWedges } from "./wheelMath";

describe("wheel math", () => {
  it("sizes wedges proportionally to tickets, covering the full circle", () => {
    const wedges = wheelWedges([{ tickets: 1 }, { tickets: 2 }, { tickets: 1 }]);
    expect(wedges[0].startDeg).toBe(0);
    expect(wedges[0].endDeg).toBeCloseTo(90);
    expect(wedges[1].endDeg).toBeCloseTo(270);
    expect(wedges[2].endDeg).toBeCloseTo(360);
    expect(wedges[1].midDeg).toBeCloseTo(180);
  });

  it("parks the winner's wedge center under the top pointer", () => {
    const entrants = [{ tickets: 5 }, { tickets: 1 }, { tickets: 3 }, { tickets: 7 }];
    const wedges = wheelWedges(entrants);
    for (const [index, wedge] of wedges.entries()) {
      const rotation = finalRotationDeg(wedges, index, 5);
      const landed = (wedge.midDeg + rotation) % 360;
      expect(Math.min(landed, 360 - landed)).toBeCloseTo(0, 6);
      expect(rotation).toBeGreaterThanOrEqual(5 * 360);
      expect(rotation).toBeLessThan(6 * 360);
    }
  });

  it("lands inside the winner's wedge for uneven ticket spreads", () => {
    const entrants = [{ tickets: 149 }, { tickets: 1 }];
    const wedges = wheelWedges(entrants);
    const rotation = finalRotationDeg(wedges, 1, 4);
    const finalMid = (wedges[1].midDeg + rotation) % 360;
    expect(Math.min(finalMid, 360 - finalMid)).toBeLessThan(wedges[1].endDeg - wedges[1].startDeg);
  });

  it("degrades safely on an empty or zero-ticket pool", () => {
    expect(wheelWedges([])).toEqual([]);
    const zeroes = wheelWedges([{ tickets: 0 }, { tickets: 0 }]);
    expect(zeroes).toHaveLength(2);
    expect(finalRotationDeg(zeroes, 5, 4)).toBe(4 * 360);
  });
});

describe("wedgeAtPointer", () => {
  it("tracks the wedge under the pointer through a spin", () => {
    const wedges = wheelWedges([{ tickets: 1 }, { tickets: 1 }, { tickets: 2 }]);
    expect(wedgeAtPointer(wedges, 0)).toBe(0);
    expect(wedgeAtPointer(wedges, 10)).toBe(2);
    expect(wedgeAtPointer(wedges, 300)).toBe(0);
    expect(wedgeAtPointer(wedges, 10 + 720)).toBe(2);
  });

  it("lands on the winner after the final rotation", () => {
    const wedges = wheelWedges([{ tickets: 3 }, { tickets: 5 }, { tickets: 2 }]);
    for (const winner of [0, 1, 2]) {
      expect(wedgeAtPointer(wedges, finalRotationDeg(wedges, winner, 4))).toBe(winner);
    }
  });

  it("handles the empty pool", () => {
    expect(wedgeAtPointer([], 90)).toBe(-1);
  });
});
