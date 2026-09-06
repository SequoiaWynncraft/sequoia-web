import { describe, expect, it } from "vitest";

import { rollupDayBounds } from "./rollupWindow";

/**
 * The rollups only hold whole UTC days, so both bounds have to be snapped to
 * days that lie entirely inside the event. These cases pin which days survive.
 */
describe("rollupDayBounds", () => {
  it("keeps a midnight start, which already begins a full day", () => {
    expect(rollupDayBounds({ from: "2026-07-01T00:00:00.000Z", to: "2026-07-08T12:30:00.000Z" }).fromDay).toBe(
      "2026-07-01",
    );
  });

  it("advances a mid-day start to the first full day", () => {
    expect(rollupDayBounds({ from: "2026-07-01T18:00:00.000Z", to: "2026-07-08T12:30:00.000Z" }).fromDay).toBe(
      "2026-07-02",
    );
  });

  it("keeps a mid-day end, as a live event asking with `now` does", () => {
    expect(rollupDayBounds({ from: "2026-07-01T00:00:00.000Z", to: "2026-07-08T12:30:00.000Z" }).toDay).toBe(
      "2026-07-08",
    );
  });

  it("steps a midnight end back a day - that midnight belongs to the next day", () => {
    expect(rollupDayBounds({ from: "2026-07-01T00:00:00.000Z", to: "2026-07-08T00:00:00.000Z" }).toDay).toBe(
      "2026-07-07",
    );
  });

  it("reads a one-day midnight-to-midnight window as exactly that day", () => {
    expect(rollupDayBounds({ from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z" })).toEqual({
      fromDay: "2026-07-01",
      toDay: "2026-07-01",
    });
  });

  it("crosses a month boundary when stepping the end back", () => {
    expect(rollupDayBounds({ from: "2026-06-01T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" }).toDay).toBe(
      "2026-06-30",
    );
  });

  it("yields an empty range for an event whose days have not landed yet", () => {
    const { fromDay, toDay } = rollupDayBounds({
      from: "2026-07-01T10:00:00.000Z",
      to: "2026-07-01T20:00:00.000Z",
    });
    // Callers treat fromDay > toDay as "no whole day to count".
    expect(fromDay > toDay).toBe(true);
  });
});
