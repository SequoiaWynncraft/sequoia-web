import { describe, expect, it } from "vitest";
import {
  ATTACK_RATES,
  HEALTHS,
  calcDefenseIndex,
  calcDps,
  calcDpsRange,
  calcEhp,
  calcStat,
  defenseRating,
  formatStat,
} from "#lib/site/tower.js";

describe("tower calculator", () => {
  it("applies only the connection multiplier off HQ", () => {
    expect(calcStat(1000, false, 4, 24)).toBeCloseTo(2200, 9);
  });

  it("stacks the external multiplier on top of connections at HQ", () => {
    expect(calcStat(5400, true, 4, 24)).toBeCloseTo(89_100, 9);
  });

  it("matches the map's HQ health table at 6 connections and 28 externals", () => {
    const expected = [
      7_140_000, 10_710_000, 14_280_000, 17_850_000, 22_848_000, 28_560_000, 35_700_000,
      44_268_000, 52_836_000, 61_404_000, 69_972_000, 78_540_000,
    ];

    expected.forEach((health, level) => {
      expect(Math.round(calcStat(HEALTHS[level], true, 6, 28))).toBe(health);
    });
  });

  it("counts both hits of a tower attack in the DPS band", () => {
    expect(calcDpsRange(0, 0, false, 0, 0)).toEqual([1000, 1500]);
    expect(calcDps(0, 0, false, 0, 0)).toBeCloseTo(1250, 9);
  });

  it("reports average DPS as the midpoint of the band", () => {
    const [lo, hi] = calcDpsRange(5, 7, true, 4, 12);
    expect(calcDps(5, 7, true, 4, 12)).toBeCloseTo((lo + hi) / 2, 9);
  });

  it("keeps the mid-level attack rates the map uses", () => {
    expect(ATTACK_RATES[4]).toBeCloseTo(1.61, 9);
    expect(ATTACK_RATES[8]).toBeCloseTo(3.6, 9);
    expect(ATTACK_RATES[9]).toBeCloseTo(3.8, 9);
  });

  it("divides health by the remaining damage taken for EHP", () => {
    expect(calcEhp(0, 0, false, 0, 0)).toBeCloseTo(300_000 / 0.9, 9);
    expect(calcEhp(11, 11, false, 0, 0)).toBeCloseTo(33_000_000, 3);
  });

  it("clamps levels above the table length", () => {
    expect(calcDps(99, 42, false, 0, 0)).toBeCloseTo(calcDps(11, 11, false, 0, 0), 9);
    expect(calcDpsRange(99, 42, false, 0, 0)).toEqual(calcDpsRange(11, 11, false, 0, 0));
    expect(calcEhp(99, 42, false, 0, 0)).toBeCloseTo(calcEhp(11, 11, false, 0, 0), 9);
    expect(calcDefenseIndex(99, 42, 12, 15, 10, 99, true, 1, 5)).toBe(
      calcDefenseIndex(11, 11, 11, 11, 3, 3, true, 1, 5),
    );
  });

  it("adds a flat bonus for each of aura and volley being switched on", () => {
    expect(calcDefenseIndex(0, 0, 0, 0, 0, 0, false, 0, 0)).toBe(0);
    expect(calcDefenseIndex(0, 0, 0, 0, 1, 0, false, 0, 0)).toBe(6);
    expect(calcDefenseIndex(0, 0, 0, 0, 0, 1, false, 0, 0)).toBe(4);
    expect(calcDefenseIndex(0, 0, 0, 0, 1, 1, false, 0, 0)).toBe(10);
    expect(calcDefenseIndex(11, 11, 11, 11, 3, 3, false, 0, 0)).toBe(58);
  });

  it("only counts the network in the defense index at HQ", () => {
    expect(calcDefenseIndex(0, 0, 0, 0, 0, 0, false, 4, 7)).toBe(0);
    expect(calcDefenseIndex(0, 0, 0, 0, 0, 0, true, 1, 0)).toBe(19);
    expect(calcDefenseIndex(0, 0, 0, 0, 0, 0, true, 1, 1)).toBe(21);
    expect(calcDefenseIndex(0, 0, 0, 0, 0, 0, true, 0, 5)).toBe(23);
  });

  it("buckets the defense index at the same boundaries as the map", () => {
    const label = (index: number) => defenseRating(index).label;

    expect(label(0)).toBe("Very Low");
    expect(label(5)).toBe("Very Low");
    expect(label(6)).toBe("Low");
    expect(label(18)).toBe("Low");
    expect(label(19)).toBe("Medium");
    expect(label(30)).toBe("Medium");
    expect(label(31)).toBe("High");
    expect(label(48)).toBe("High");
    expect(label(49)).toBe("Very High");
  });

  it("abbreviates millions and thousands", () => {
    expect(formatStat(1_250_000)).toBe("1.2M");
    expect(formatStat(12_000)).toBe("12k");
    expect(formatStat(999)).toBe("999");
  });

  it("picks the suffix from the rounded value, not the raw one", () => {
    expect(calcEhp(0, 4, false, 0, 0)).toBeLessThan(1_000_000);
    expect(formatStat(calcEhp(0, 4, false, 0, 0))).toBe("1.0M");

    expect(formatStat(999_499)).toBe("999k");
    expect(formatStat(999_500)).toBe("1.0M");
    expect(formatStat(999.6)).toBe("1k");
    expect(formatStat(600)).toBe("600");
  });
});
