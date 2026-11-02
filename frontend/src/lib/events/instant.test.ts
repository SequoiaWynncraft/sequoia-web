import { describe, expect, it } from "vitest";

import { parseInstant } from "./instant";

describe("parseInstant", () => {
  it.each([
    ["2026-07-05T18:00:00Z", "2026-07-05T18:00:00.000Z"],
    ["2026-07-05T18:00:00.123Z", "2026-07-05T18:00:00.123Z"],
    ["2026-07-05T18:00:00.123456789Z", "2026-07-05T18:00:00.123Z"],
    ["2026-07-05T20:00:00+02:00", "2026-07-05T18:00:00.000Z"],
    ["2026-07-05T12:30:00-05:30", "2026-07-05T18:00:00.000Z"],
    ["2026-01-01T00:30:00+01:00", "2025-12-31T23:30:00.000Z"],
    ["2024-02-29T10:00:00Z", "2024-02-29T10:00:00.000Z"],
    ["2000-02-29T00:00:00Z", "2000-02-29T00:00:00.000Z"],
    ["2026-07-05t18:00:00z", "2026-07-05T18:00:00.000Z"],
    ["  2026-07-05T18:00:00Z  ", "2026-07-05T18:00:00.000Z"],
    ["0050-03-01T00:00:00Z", "0050-03-01T00:00:00.000Z"],
  ])("normalizes %s to UTC", (input, expected) => {
    expect(parseInstant(input)).toBe(expected);
  });

  it.each([
    ["an impossible leap day", "2026-02-29T10:00:00Z"],
    ["a century without a leap day", "1900-02-29T10:00:00Z"],
    ["February 30", "2026-02-30T10:00:00Z"],
    ["April 31", "2026-04-31T10:00:00Z"],
    ["month 13", "2026-13-01T10:00:00Z"],
    ["day 0", "2026-07-00T10:00:00Z"],
    ["hour 24", "2026-03-01T24:00:00Z"],
    ["minute 60", "2026-03-01T10:60:00Z"],
    ["second 60", "2026-03-01T10:00:60Z"],
    ["an offset beyond 23 hours", "2026-03-01T10:00:00+25:00"],
    ["an offset with 60 minutes", "2026-03-01T10:00:00+05:60"],
    ["an offset without a colon", "2026-03-01T10:00:00+0200"],
    ["slash separators", "2026/03/01T10:00:00Z"],
    ["a space instead of T", "2026-03-01 10:00:00Z"],
    ["a month name", "Mar 1 2026 10:00:00 Z"],
    ["missing seconds", "2026-03-01T10:00Z"],
    ["no timezone", "2026-03-01T10:00:00"],
    ["a date alone", "2026-03-01"],
    ["an empty string", ""],
  ])("rejects %s", (_case, input) => {
    expect(parseInstant(input)).toBeNull();
  });

  it.each([null, undefined, 1_783_000_000_000, {}, ["2026-07-05T18:00:00Z"]])("rejects non-string %j", (input) => {
    expect(parseInstant(input)).toBeNull();
  });
});
