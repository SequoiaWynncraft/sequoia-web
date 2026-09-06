import { describe, expect, it } from "vitest";

import { ALL_DAYS, PRESET_DAYS, resolveRange, resolveScope } from "./range";

/** Days a from..to pair covers, counted the way the rollup feed sums them. */
function inclusiveDays({ from, to }: { from: string; to: string }): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

const NOW = new Date("2026-09-06T10:00:00.000Z");

/**
 * The chips are labelled in days, and the feed sums whole UTC days inclusively.
 * These cases pin that an N-day chip asks for exactly N days - the off-by-one
 * that made a "1d" scope sum two days and report 26h of playtime.
 */
describe("resolveRange", () => {
  it.each(Object.entries(PRESET_DAYS))("spans exactly %s worth of days", (range, days) => {
    expect(inclusiveDays(resolveRange(range, NOW))).toBe(days);
  });

  it("resolves 1d to today alone", () => {
    expect(resolveRange("1d", NOW)).toEqual({ from: "2026-09-06", to: "2026-09-06" });
  });

  it("resolves yd to yesterday alone, a whole day the rollups have finished", () => {
    expect(resolveRange("yd", NOW)).toEqual({ from: "2026-09-05", to: "2026-09-05" });
    expect(inclusiveDays(resolveRange("yd", NOW))).toBe(1);
  });

  it("walks yd back across a month boundary", () => {
    expect(resolveRange("yd", new Date("2026-09-01T04:00:00.000Z"))).toEqual({
      from: "2026-08-31",
      to: "2026-08-31",
    });
  });

  it("ends every window on the current UTC day", () => {
    for (const range of [...Object.keys(PRESET_DAYS), "ytd", "all"]) {
      expect(resolveRange(range, NOW).to).toBe("2026-09-06");
    }
  });

  it("counts 1w back six days, not seven", () => {
    expect(resolveRange("1w", NOW).from).toBe("2026-08-31");
  });

  it("starts ytd at the first of January", () => {
    expect(resolveRange("ytd", NOW).from).toBe("2026-01-01");
  });

  it("keeps `all` inside the backend's 400 inclusive-day clamp", () => {
    expect(inclusiveDays(resolveRange("all", NOW))).toBe(ALL_DAYS);
    expect(ALL_DAYS).toBeLessThanOrEqual(400);
  });

  it("crosses a month boundary correctly", () => {
    expect(resolveRange("3d", new Date("2026-09-02T04:00:00.000Z"))).toEqual({
      from: "2026-08-31",
      to: "2026-09-02",
    });
  });
});

describe("resolveScope", () => {
  it("passes through every known chip", () => {
    for (const range of [...Object.keys(PRESET_DAYS), "ytd", "yd", "all"]) {
      expect(resolveScope(range)).toBe(range);
    }
  });

  it("falls back to now for an unknown range", () => {
    expect(resolveScope("7y")).toBe("now");
  });

  it("does not mistake a prototype key for a preset", () => {
    // `in` would accept these and resolve them to a NaN window.
    expect(resolveScope("constructor")).toBe("now");
    expect(resolveScope("toString")).toBe("now");
  });
});
