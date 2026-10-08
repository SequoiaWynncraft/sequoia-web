import { describe, expect, it } from "vitest";

import {
  calendarTime,
  charCount,
  definitionIssues,
  embedCharacters,
  truncateChars,
  fieldColumns,
  formatTimestamp,
  fromLocalInput,
  issuesUnder,
  parseHexColor,
  toLocalInput,
  standaloneAttachments,
} from "./format";
import type { Definition } from "./types";

function draft(overrides: Partial<Definition> = {}): Definition {
  return { name: "Rules", channel_id: "1", content: "Read these", embeds: [], rows: [], ...overrides };
}

it("keeps a four-thumbnail insignia panel free of duplicate standalone images", () => {
  const attachments = [1, 2, 3, 4].map((id) => ({ id: `asset-${id}`, filename: `insignia-${id}.png`, description: null }));
  const panel = draft({ attachments, embeds: attachments.map((a) => ({ type: "rich", title: "Insignia", thumbnail: { url: `attachment://${a.filename}` } })) });
  expect(standaloneAttachments(panel)).toEqual([]);
  panel.embeds.pop();
  expect(standaloneAttachments(panel)).toEqual([attachments[3]]);
  panel.embeds.push({ type: "rich", title: "Image", image: { url: "attachment://insignia-4.png" } });
  expect(standaloneAttachments(panel)).toEqual([]);
});

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
    expect(definitionIssues(draft({ content: " " })).content).toBe("Add message text, an embed or a button.");
    expect(definitionIssues(draft({ embeds: [{ type: "rich", color: 1 }] }))["embeds.0"]).toBeDefined();
    expect(definitionIssues(draft({ content: "", embeds: [{ type: "rich", title: "  ", description: "\n\t" }] }))["embeds.0"]).toBeDefined();
  });

  it("flags a server emoji Discord no longer offers, as publication would reject it", () => {
    const panel = draft({ rows: [[{
      id: "link", label: "Rules", style: 5, emoji: { id: "42", name: "seq", animated: false },
      action: { kind: "link", url: "https://seqwawa.com" },
    }]] });
    expect(definitionIssues(panel, { emojis: new Set(["42"]) })).toEqual({});
    expect(definitionIssues(panel, { emojis: new Set() })["rows.0.0.server_emoji"]).toContain("no longer available");
    expect(definitionIssues(panel)).toEqual({});
  });

  it("measures embed text after Discord's whitespace trim, but message text raw", () => {
    const padded = (text: string) => `  ${text}\n`;
    const atLimit = draft({ embeds: [{
      type: "rich", title: padded("t".repeat(256)), description: padded("d".repeat(4096)),
      author: { name: padded("a".repeat(256)) }, footer: { text: padded("f".repeat(1000)) },
      fields: [{ name: padded("n".repeat(256)), value: padded("v".repeat(136)), inline: false }],
    }] });
    expect(definitionIssues(atLimit)).toEqual({});
    expect(embedCharacters(atLimit.embeds[0])).toBe(6000);
    const over = draft({ embeds: [{ ...atLimit.embeds[0], footer: { text: padded("f".repeat(1001)) } }] });
    expect(definitionIssues(over).embeds).toContain("6001");
    expect(definitionIssues(draft({ content: ` ${"x".repeat(2000)}` })).content).toContain("2001");
  });

  it("trims embed text exactly as Rust does at U+0085 and U+FEFF", () => {
    const titled = (title: string) => draft({ embeds: [{ type: "rich", title }] });
    // Rust's str::trim removes NEL (White_Space) but keeps a byte-order mark.
    expect(definitionIssues(titled(`\u0085${"t".repeat(256)}\u0085`))).toEqual({});
    expect(definitionIssues(titled(`\uFEFF${"t".repeat(256)}\uFEFF`))["embeds.0.title"]).toContain("258");
    const metadata = draft({ embeds: [{ type: "rich", title: "Rules", author: { name: "\u0085" }, footer: { text: "\uFEFF" } }] });
    expect(definitionIssues(metadata)["embeds.0.author"]).toBe("Authors need a name.");
    expect(definitionIssues(metadata)["embeds.0.footer"]).toBeUndefined();
    expect(definitionIssues(draft({ content: "x", embeds: [{ type: "rich", title: "\u0085" }] }))["embeds.0"]).toBeDefined();
  });

  it("truncates by characters without splitting an emoji", () => {
    const name = `a${"🎉".repeat(60)} copy`;
    const truncated = truncateChars(name, 100);
    expect(truncated).toBe(`a${"🎉".repeat(60)} copy`);
    expect(truncateChars(`a${"🎉".repeat(120)}`, 100)).toBe(`a${"🎉".repeat(99)}`);
    expect([...truncateChars(`a${"🎉".repeat(120)}`, 100)].every((char) => char.length <= 2 && !/^[\uD800-\uDFFF]$/.test(char))).toBe(true);
  });

  it("flags a saved channel absent from current context", () => {
    expect(definitionIssues(draft(), { channels: new Set(["1"]) })).toEqual({});
    expect(definitionIssues(draft(), { channels: new Set() })["channel_id"]).toBe("Choose an available channel.");
  });

  it("requires one complete Unicode button emoji, not text or multiple emoji", () => {
    const panel = (name: string) => draft({ rows: [[{
      id: "link", label: "", style: 5, emoji: { name }, action: { kind: "link", url: "https://seqwawa.com" },
    }]] });
    for (const name of [" ", "hello", "1", "🎉🎉", "🎉text", "🏽", "🦰", "\u{1FAEB}"]) expect(definitionIssues(panel(name))["rows.0.0.emoji"]).toBeDefined();
    for (const name of ["🎉", "❤", "⚔️", "🇸🇪", "1️⃣", "👩🏽‍💻", "👎️"]) expect(definitionIssues(panel(name))).toEqual({});
  });

  it("requires metadata text when an author or footer object exists", () => {
    const issues = definitionIssues(draft({ embeds: [{
      type: "rich", title: "Rules",
      author: { name: "", url: "https://seqwawa.com" },
      footer: { text: " ", icon_url: "https://seqwawa.com/icon.png" },
    }] }));
    expect(issues["embeds.0.author"]).toBe("Authors need a name.");
    expect(issues["embeds.0.footer"]).toBe("Footers need text.");
  });

  it("counts a valid timestamp as visible embed content", () => {
    expect(definitionIssues(draft({ content: "", embeds: [{ type: "rich", timestamp: "2026-10-07T12:00:00Z" }] }))).toEqual({});
    const issues = definitionIssues(draft({ embeds: [{ type: "rich", timestamp: "invalid" }] }));
    expect(issues["embeds.0.timestamp"]).toBeDefined();
    expect(issues["embeds.0"]).toBeDefined();
  });

  it("flags later embeds Discord would hide behind a duplicate URL", () => {
    const embeds = [
      { type: "rich" as const, title: "First", url: "https://seqwawa.com" },
      { type: "rich" as const, title: "Second", url: "https://seqwawa.com" },
    ];
    expect(definitionIssues(draft({ embeds }))["embeds.1.url"]).toContain("only the first");
    embeds[1].url = "https://seqwawa.com/events";
    expect(definitionIssues(draft({ embeds }))).toEqual({});
    expect(definitionIssues(draft({ embeds: [{ type: "rich", title: "First" }, { type: "rich", title: "Second" }] }))).toEqual({});
  });

  it("accepts button-only panels but flags roles outside current self-service approval", () => {
    const panel = draft({ content: "", rows: [[{
      id: "role", label: "Defender", style: 2, emoji: null, action: { kind: "role", role_id: "123" },
    }]] });
    expect(definitionIssues(panel, { roles: new Set(["123"]) })).toEqual({});
    expect(definitionIssues(panel, { roles: new Set() })["rows.0.0.role"]).toBe("Choose an enabled self-service role.");
    expect(definitionIssues(draft({ content: "", rows: [[]] })).content).toBeDefined();
  });

  it("enforces the link-button URL boundary", () => {
    const prefix = "https://seqwawa.com/";
    const atLimit = prefix + "a".repeat(512 - prefix.length);
    const panel = (url: string) => draft({ rows: [[{
      id: "link", label: "Website", style: 5, emoji: null, action: { kind: "link", url },
    }]] });
    expect(definitionIssues(panel(atLimit))).toEqual({});
    expect(definitionIssues(panel(atLimit + "a"))["rows.0.0.url"]).toContain("513");
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
