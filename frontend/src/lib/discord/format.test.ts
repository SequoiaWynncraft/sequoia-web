import { describe, expect, it } from "vitest";

import {
  calendarTime,
  charCount,
  definitionIssues,
  fieldColumns,
  formatTimestamp,
  fromLocalInput,
  issuesUnder,
  parseHexColor,
  toLocalInput,
} from "./format";
import type { Definition } from "./types";

function draft(overrides: Partial<Definition> = {}): Definition {
  return { name: "Rules", channel_id: "1", content: "Read these", embeds: [], rows: [], ...overrides };
}

describe("definitionIssues", () => {
  it("accepts a realistic panel", () => {
    expect(
      definitionIssues(
        draft({
          embeds: [{ type: "rich", title: "Rules", description: "Be kind.", fields: [{ name: "1", value: "No spam", inline: true }] }],
          rows: [[{ id: "a", label: "Website", style: 5, emoji: null, action: { kind: "link", url: "https://seqwawa.com" } }]],
        }),
      ),
    ).toEqual({});
  });

  it("counts characters like Discord and reports each limit where it applies", () => {
    expect(charCount("🎉🎉")).toBe(2);
    const issues = definitionIssues(
      draft({
        content: "🎉".repeat(2001),
        embeds: [
          { type: "rich", description: "x".repeat(4000), fields: [{ name: "", value: "y".repeat(1025), inline: false }] },
          { type: "rich", description: "x".repeat(2000), url: "javascript:alert(1)" },
        ],
        rows: [[{ id: "a", label: "", style: 2, emoji: null, action: { kind: "role", role_id: "" } }], []],
      }),
    );
    expect(issues.content).toBe("Message text is 2001 characters; Discord allows 2000.");
    expect(issues["embeds.0.fields.0.name"]).toBe("Fields need a name.");
    expect(issues["embeds.0.fields.0.value"]).toContain("1025");
    expect(issues["embeds.1.url"]).toBe("Use a full http or https link.");
    expect(issues.embeds).toBe("Embeds hold 7025 characters together; Discord allows 6000.");
    expect(issues["rows.0.0.label"]).toBeDefined();
    expect(issues["rows.0.0.role"]).toBe("Choose a role.");
    expect(issues["rows.1"]).toBeDefined();
    expect(issuesUnder(issues, "embeds.0")).toHaveLength(2);
  });

  it("requires something visible", () => {
    expect(definitionIssues(draft({ content: " " })).content).toBe("Add message text or an embed.");
    expect(definitionIssues(draft({ embeds: [{ type: "rich", color: 1 }] }))["embeds.0"]).toBeDefined();
  });
});

describe("fieldColumns", () => {
  it("follows Discord's inline field rows", () => {
    const inline = { inline: true };
    const block = { inline: false };
    expect(fieldColumns([inline, inline, inline, inline, block, inline, inline], false)).toEqual([
      "1 / 5", "5 / 9", "9 / 13", "1 / 13", "1 / 13", "1 / 7", "7 / 13",
    ]);
    expect(fieldColumns([inline, inline, inline], true)).toEqual(["1 / 7", "7 / 13", "1 / 13"]);
  });
});

describe("time formatting", () => {
  const at = Date.UTC(2026, 9, 7, 12, 30) / 1000;

  it("formats Discord timestamp styles", () => {
    const now = at * 1000;
    expect(formatTimestamp(at + 7200, "R", now, "en-GB")).toBe("in 2 hours");
    expect(formatTimestamp(at - 86_400 * 3, "R", now, "en-GB")).toBe("3 days ago");
    expect(formatTimestamp(at, "D", now, "en-GB")).toMatch(/7 October 2026/);
    expect(formatTimestamp(Number.NaN, "f", now)).toBe("Invalid Date");
  });

  it("uses calendar wording for message and footer times", () => {
    const now = new Date(2026, 9, 7, 18, 0);
    expect(calendarTime(new Date(2026, 9, 7, 9, 5), now, "en-GB")).toBe("Today at 09:05");
    expect(calendarTime(new Date(2026, 9, 6, 9, 5), now, "en-GB")).toBe("Yesterday at 09:05");
    expect(calendarTime(new Date(2026, 8, 1, 9, 5), now, "en-GB")).toBe("01/09/2026 09:05");
  });

  it("round-trips datetime-local values with a time zone", () => {
    const iso = fromLocalInput("2026-10-07T12:00");
    expect(iso).toMatch(/Z$/);
    expect(toLocalInput(iso)).toBe("2026-10-07T12:00");
    expect(fromLocalInput("")).toBeUndefined();
  });

  it("parses hex colours", () => {
    expect(parseHexColor("#19A775")).toBe(0x19a775);
    expect(parseHexColor("19a775")).toBe(0x19a775);
    expect(parseHexColor("#12345")).toBeUndefined();
  });
});
