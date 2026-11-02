import type { ComponentProps } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import DailyBars from "./DailyBars.svelte";

/** Server markup without scoped-style classes and hydration comments. */
function markup(props: ComponentProps<typeof DailyBars>): string {
  return render(DailyBars, { props }).body.replace(/ class="[^"]*"/g, "").replace(/<!--.*?-->/g, "");
}

function tableRows(body: string): string[] {
  const tbody = body.slice(body.indexOf("<tbody>"), body.indexOf("</tbody>"));
  return [...tbody.matchAll(/<tr>(.*?)<\/tr>/g)].map((match) => match[1]);
}

describe("DailyBars table", () => {
  it("lists every day in the window, zero days included, newest first", () => {
    const body = markup({
      points: [{ day: "2026-10-30", value: 3 }],
      from: "2026-10-29",
      to: "2026-10-31",
      metricLabel: "Wars",
    });

    const rows = tableRows(body);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("Oct 31, 2026");
    expect(rows[0]).toContain(">0</td>");
    expect(rows[1]).toContain(">3</td>");
    expect(rows[2]).toContain("Oct 29, 2026");
  });

  it("names each row by its period and the table by metric and range", () => {
    const body = markup({ points: [], from: "2026-10-30", to: "2026-10-31", metricLabel: "Playtime", unit: " h" });

    expect(body).toContain("<caption>Playtime per day, Oct 30, 2026 to Oct 31, 2026</caption>");
    expect(tableRows(body).every((row) => row.startsWith('<th scope="row">'))).toBe(true);
    expect(tableRows(body)[0]).toContain(">0 h</td>");
  });

  it("buckets a long window by week without dropping quiet weeks", () => {
    const body = markup({
      points: [{ day: "2026-01-01", value: 5 }],
      from: "2025-09-29",
      to: "2026-11-02",
      metricLabel: "Raids",
    });

    const rows = tableRows(body);
    expect(rows).toHaveLength(Math.ceil(400 / 7));
    expect(body).toContain("Raids per week");
    expect(rows.filter((row) => row.includes(">0</td>"))).toHaveLength(rows.length - 1);
  });
});
