import { describe, expect, it } from "vitest";

import { RAID_WINDOWS, parseDuration, parseTimestampRange, raidWindowPreset } from "$lib/site/duration";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("parseDuration", () => {
  it("parses each supported unit", () => {
    expect(parseDuration("20min")?.ms).toBe(20 * MIN);
    expect(parseDuration("7h")?.ms).toBe(7 * HOUR);
    expect(parseDuration("0.5d")?.ms).toBe(0.5 * DAY);
    expect(parseDuration("1m")?.ms).toBe(30 * DAY);
  });

  it("reads minute inputs as minutes, not months", () => {
    expect(parseDuration("5min")?.ms).toBe(5 * MIN);
    expect(parseDuration("5m")?.ms).toBe(5 * 30 * DAY);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(parseDuration("  7H ")?.ms).toBe(7 * HOUR);
    expect(parseDuration("30 MIN")?.ms).toBe(30 * MIN);
  });

  it("keeps the original number in the label, unspaced for the display face", () => {
    expect(parseDuration("0.5d")?.label).toBe("0.5d");
    expect(parseDuration("20min")?.label).toBe("20min");
    expect(parseDuration("1m")?.label).toBe("1mo");
  });

  it("rejects malformed, non-positive, and unknown-unit inputs", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("7")).toBeNull();
    expect(parseDuration("0d")).toBeNull();
    expect(parseDuration("-3h")).toBeNull();
    expect(parseDuration("7w")).toBeNull();
  });

  it("rejects windows longer than about a year", () => {
    expect(parseDuration("400d")).toBeNull();
    expect(parseDuration("13m")).toBeNull();
  });
});

describe("raidWindowPreset", () => {
  it("names the preset an input matches", () => {
    expect(raidWindowPreset("7d")?.label).toBe("7 days");
    expect(raidWindowPreset(" 30D ")?.key).toBe("30d");
  });

  it("returns null for a custom window", () => {
    expect(raidWindowPreset("0.5d")).toBeNull();
    expect(raidWindowPreset("t:1784109600-1784282400")).toBeNull();
    expect(raidWindowPreset("")).toBeNull();
  });

  it("offers only windows the duration parser accepts", () => {
    for (const window of RAID_WINDOWS) {
      expect(parseDuration(window.key)).not.toBeNull();
    }
  });
});

describe("parseTimestampRange", () => {
  // A fixed "now" well after the sample timestamps, for deterministic clamping.
  const now = new Date(1_800_000_000_000); // 2027-01-15T08:00:00Z

  it("parses a t:-prefixed start-end range into epoch milliseconds", () => {
    expect(parseTimestampRange("t:1784109600-1784282400", now)).toEqual({
      range: { fromMs: 1784109600_000, toMs: 1784282400_000 },
    });
  });

  it("accepts an uppercase T: prefix and is whitespace-insensitive", () => {
    expect(parseTimestampRange("  T: 1784109600 - 1784282400 ", now)).toEqual({
      range: { fromMs: 1784109600_000, toMs: 1784282400_000 },
    });
  });

  it("auto-corrects a reversed range so the earlier timestamp is the start", () => {
    expect(parseTimestampRange("t:1784282400-    1784109600", now)).toEqual({
      range: { fromMs: 1784109600_000, toMs: 1784282400_000 },
    });
  });

  it("clamps an end past now to now", () => {
    const future = String(Math.floor(now.getTime() / 1000) + 10_000);
    expect(parseTimestampRange(`t:1784109600-${future}`, now)).toEqual({
      range: { fromMs: 1784109600_000, toMs: now.getTime() },
    });
  });

  it("errors, naming the year, when the start is before raid tracking began", () => {
    // 2019-06-01T00:00:00Z, before the 2020 tracking floor.
    const result = parseTimestampRange("t:1559347200-1784282400", now);
    expect(result).toEqual({ error: "Outside of tracked time, you tried to query year 2019." });
  });

  it("errors on an empty window once clamped", () => {
    expect(parseTimestampRange("t:1784109600-1784109600", now)).toEqual({
      error: "That timeframe is empty.",
    });
  });

  it("returns null for input without a t: prefix (not a range attempt)", () => {
    expect(parseTimestampRange("7h", now)).toBeNull();
    expect(parseTimestampRange("abc", now)).toBeNull();
    expect(parseTimestampRange("1784109600", now)).toBeNull();
    expect(parseTimestampRange("1784109600-1784282400", now)).toBeNull();
    expect(parseTimestampRange("2020-2024", now)).toBeNull();
    expect(parseTimestampRange("", now)).toBeNull();
  });

  it("errors on a t: prefixed input that isn't a valid range", () => {
    expect(parseTimestampRange("t:abc", now)).toEqual({
      error: "Couldn't read that timestamp range.",
    });
    expect(parseTimestampRange("t:1784109600", now)).toEqual({
      error: "Couldn't read that timestamp range.",
    });
  });

  it("allows spans longer than a year, since the 2020 floor bounds the query", () => {
    // ~2020-01-02 to now (2027): well over a year, but both after the floor.
    expect(parseTimestampRange("t:1577923200-1784282400", now)).toEqual({
      range: { fromMs: 1577923200_000, toMs: 1784282400_000 },
    });
  });
});
