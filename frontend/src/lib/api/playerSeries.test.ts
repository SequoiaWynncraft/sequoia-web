import { describe, expect, it } from "vitest";

import { SERIES_DAYS, TRACK_RANGE_DAYS, trackWindow, windowStart } from "./playerSeries";

function inclusiveDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

describe("player series windows", () => {
  it("shows every fetched day under the all range", () => {
    const to = "2026-11-02";
    const fetched = { from: windowStart(to, SERIES_DAYS), to };

    const window = trackWindow(fetched, "all");

    expect(window).toEqual(fetched);
    expect(inclusiveDays(window.from, window.to)).toBe(400);
  });

  it.each(Object.entries(TRACK_RANGE_DAYS))("keeps the %s range at its labelled inclusive length", (range, days) => {
    const to = "2026-11-02";

    const window = trackWindow({ from: windowStart(to, SERIES_DAYS), to }, range);

    expect(inclusiveDays(window.from, window.to)).toBe(days);
  });

  it("never reaches before the first fetched day of a short series", () => {
    expect(trackWindow({ from: "2026-10-20", to: "2026-11-02" }, "1m")).toEqual({
      from: "2026-10-20",
      to: "2026-11-02",
    });
  });

  it("counts back across month, year and leap-day boundaries", () => {
    expect(windowStart("2026-03-01", 2)).toBe("2026-02-28");
    expect(windowStart("2024-03-01", 2)).toBe("2024-02-29");
    expect(windowStart("2026-01-06", 7)).toBe("2025-12-31");
    expect(windowStart("2026-11-02", 1)).toBe("2026-11-02");
  });
});
