import { Window } from "happy-dom";
import type { ComponentProps } from "svelte";
import { render } from "svelte/server";
import { afterAll, describe, expect, it } from "vitest";

import DailyBars from "./DailyBars.svelte";

const window = new Window();
afterAll(() => window.happyDOM.close());

function table(props: ComponentProps<typeof DailyBars>) {
  const page = new window.DOMParser().parseFromString(render(DailyBars, { props }).body, "text/html");
  return {
    caption: page.querySelector("table > caption")?.textContent,
    columns: [...page.querySelectorAll('thead th[scope="col"]')].map((cell) => cell.textContent),
    rows: [...page.querySelectorAll("tbody > tr")].map((row) => ({
      period: row.querySelector('th[scope="row"]')?.textContent,
      value: row.querySelector("td")?.textContent,
    })),
  };
}

describe("DailyBars table", () => {
  it("lists every day in the window, zero days included, newest first", () => {
    const { rows } = table({
      points: [{ day: "2026-10-30", value: 3 }],
      from: "2026-10-29",
      to: "2026-10-31",
      metricLabel: "Wars",
    });

    expect(rows).toEqual([
      { period: "Oct 31, 2026", value: "0" },
      { period: "Oct 30, 2026", value: "3" },
      { period: "Oct 29, 2026", value: "0" },
    ]);
  });

  it("names each row by its period and the table by metric and range", () => {
    expect(table({ points: [], from: "2026-10-30", to: "2026-10-31", metricLabel: "Playtime", unit: " h" })).toEqual({
      caption: "Playtime per day, Oct 30, 2026 to Oct 31, 2026",
      columns: ["Day", "Playtime"],
      rows: [
        { period: "Oct 31, 2026", value: "0 h" },
        { period: "Oct 30, 2026", value: "0 h" },
      ],
    });
  });

  it("buckets a long window by week without dropping quiet weeks", () => {
    const { caption, columns, rows } = table({
      points: [{ day: "2026-01-01", value: 5 }],
      from: "2025-09-29",
      to: "2026-11-02",
      metricLabel: "Raids",
    });

    expect(caption).toBe("Raids per week, Sep 29, 2025 to Nov 2, 2026");
    expect(columns).toEqual(["Week of", "Raids"]);
    expect(rows).toHaveLength(Math.ceil(400 / 7));
    expect(rows[0]).toEqual({ period: "Nov 2, 2026", value: "0" });
    expect(rows.at(-1)).toEqual({ period: "Sep 29, 2025", value: "0" });
    expect(rows.filter((row) => row.value !== "0")).toEqual([{ period: "Dec 29, 2025", value: "5" }]);
  });
});
