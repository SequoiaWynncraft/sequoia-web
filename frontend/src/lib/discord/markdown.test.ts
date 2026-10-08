import { describe, expect, it } from "vitest";

import { isJumboEmoji, parseDiscordMarkdown, type DiscordNode } from "./markdown";

const text = (value: string): DiscordNode => ({ type: "text", text: value });

describe("parseDiscordMarkdown", () => {
  it("parses a realistic role panel into Discord blocks", () => {
    const nodes = parseDiscordMarkdown(
      "# Military Roles 📝\nPick what pings you.\n-# Roles never remove existing access\n- **Defender** – <@&1099360257098129449>\n- Light Raid\n  - weekdays\n3. Ask in <#1428466709752320041>",
    );
    expect(nodes.map((node) => node.type)).toEqual(["heading", "text", "br", "subtext", "list", "list"]);
    expect(nodes[0]).toEqual({
      type: "heading",
      level: 1,
      children: [text("Military Roles "), { type: "emoji", name: "📝", id: null, animated: false }],
    });
    const bullets = nodes[4] as Extract<DiscordNode, { type: "list" }>;
    expect(bullets.ordered).toBe(false);
    expect(bullets.items[0]).toEqual([
      { type: "strong", children: [text("Defender")] },
      text(" – "),
      { type: "mention", kind: "role", id: "1099360257098129449" },
    ]);
    expect(bullets.items[1]).toEqual([
      text("Light Raid"),
      { type: "list", ordered: false, start: 1, items: [[text("weekdays")]] },
    ]);
    expect(nodes[5]).toMatchObject({ type: "list", ordered: true, start: 3 });
  });

  it("keeps Discord's heading, quote and code rules", () => {
    expect(parseDiscordMarkdown("#### four\n#tight\nmid # line")).toEqual([
      text("#### four"), { type: "br" }, text("#tight"), { type: "br" }, text("mid # line"),
    ]);
    expect(parseDiscordMarkdown("> one\n> two\nafter")).toEqual([
      { type: "blockQuote", children: [text("one"), { type: "br" }, text("two")] },
      text("after"),
    ]);
    expect(parseDiscordMarkdown(">>> rest\nof it")).toEqual([
      { type: "blockQuote", children: [text("rest"), { type: "br" }, text("of it")] },
    ]);
    expect(parseDiscordMarkdown("```js\nconst ok = 1 < 2;\n```")).toEqual([
      { type: "codeBlock", lang: "js", text: "const ok = 1 < 2;" },
    ]);
  });

  it("starts headings and subtext on the line after a quote or list", () => {
    expect(parseDiscordMarkdown("> q\n# Heading").map((node) => node.type)).toEqual(["blockQuote", "heading"]);
    expect(parseDiscordMarkdown("- a\n-# small").map((node) => node.type)).toEqual(["list", "subtext"]);
    expect(parseDiscordMarkdown("```\nx\n```\n## H").map((node) => node.type)).toEqual(["codeBlock", "heading"]);
  });

  it("parses inline styling, spoilers, mentions, emoji and timestamps", () => {
    expect(
      parseDiscordMarkdown("***both*** __under__ ~~old~~ `code` ||**secret**|| snake_case_name"),
    ).toEqual([
      { type: "em", children: [{ type: "strong", children: [text("both")] }] },
      text(" "),
      { type: "underline", children: [text("under")] },
      text(" "),
      { type: "strike", children: [text("old")] },
      text(" "),
      { type: "inlineCode", text: "code" },
      text(" "),
      { type: "spoiler", children: [{ type: "strong", children: [text("secret")] }] },
      text(" snake_case_name"),
    ]);
    expect(
      parseDiscordMarkdown("<@123456789012345678> @everyone <a:dance:1221539883655368774> <t:1791374400:R>"),
    ).toEqual([
      { type: "mention", kind: "user", id: "123456789012345678" },
      text(" "),
      { type: "mention", kind: "everyone" },
      text(" "),
      { type: "emoji", name: "dance", id: "1221539883655368774", animated: true },
      text(" "),
      { type: "timestamp", seconds: 1791374400, format: "R" },
    ]);
  });

  it("links only http(s) targets and keeps markup and unsafe links as text", () => {
    expect(parseDiscordMarkdown("[Website](https://seqwawa.com) <https://seqwawa.com/events>")).toEqual([
      { type: "link", href: "https://seqwawa.com/", children: [text("Website")] },
      text(" "),
      { type: "link", href: "https://seqwawa.com/events", children: [text("https://seqwawa.com/events")] },
    ]);
    expect(parseDiscordMarkdown("[click](javascript:alert(1))")).toEqual([text("click")]);
    expect(parseDiscordMarkdown("<img src=x onerror=alert(1)> <b>bold</b>")).toEqual([
      text("<img src=x onerror=alert(1)> <b>bold</b>"),
    ]);
    expect(parseDiscordMarkdown("\\*literal\\*")).toEqual([text("*literal*")]);
  });

  it("renders standard shortcode aliases in ordinary text and embed headings", () => {
    const emoji = (name: string): DiscordNode => ({ type: "emoji", name, id: null, animated: false });
    expect(parseDiscordMarkdown("Guide :crossed_swords: :bow_and_arrow: :shield:")).toEqual([
      text("Guide "), emoji("⚔"), text(" "), emoji("🏹"), text(" "), emoji("🛡"),
    ]);
    expect(parseDiscordMarkdown(":+1: :thumbsup: :woman_technologist: :wave_tone3:", "title")).toEqual([
      emoji("👍"), text(" "), emoji("👍"), text(" "), emoji("👩‍💻"), text(" "), emoji("👋🏽"),
    ]);
  });

  it("keeps shortcode text literal in code, escapes and link destinations", () => {
    expect(parseDiscordMarkdown("`:shield:` \\:shield: :not_a_real_emoji:")).toEqual([
      { type: "inlineCode", text: ":shield:" }, text(" :shield: :not_a_real_emoji:"),
    ]);
    expect(parseDiscordMarkdown("```\n:shield:\n```")).toEqual([
      { type: "codeBlock", lang: "", text: ":shield:" },
    ]);
    expect(parseDiscordMarkdown("[Guide :shield:](https://seqwawa.com/:shield:)")).toEqual([
      { type: "link", href: "https://seqwawa.com/:shield:", children: [
        text("Guide "), { type: "emoji", name: "🛡", id: null, animated: false },
      ] },
    ]);
    expect(parseDiscordMarkdown("<:shield:1178447759733440523>")).toEqual([
      { type: "emoji", name: "shield", id: "1178447759733440523", animated: false },
    ]);
    expect(parseDiscordMarkdown("[Guide :shield:](https://seqwawa.com/:shield:)", "title")).toEqual([
      text("[Guide "), { type: "emoji", name: "🛡", id: null, animated: false },
      text("](https://seqwawa.com/:shield:)"),
    ]);
    expect(parseDiscordMarkdown("Visit https://seqwawa.com/:shield:", "title")).toEqual([
      text("Visit https://seqwawa.com/:shield:"),
    ]);
  });

  it("keeps out-of-range timestamp mentions literal so live preview cannot throw", () => {
    for (const token of ["<t:9999999999999999:F>", "<t:-9999999999999999:R>", "<t:9999999999999999>"]) {
      expect(parseDiscordMarkdown(token)).toEqual([text(token)]);
    }
  });

  it("renders only inline styling in embed titles and field names", () => {
    expect(parseDiscordMarkdown("# **Join** <@&1099360257098129449> [x](https://a.b)", "title")).toEqual([
      text("# "),
      { type: "strong", children: [text("Join")] },
      text(" <@&1099360257098129449> [x](https://a.b)"),
    ]);
  });
});

describe("isJumboEmoji", () => {
  it("enlarges emoji-only content", () => {
    expect(isJumboEmoji(parseDiscordMarkdown("<:seqWarning:1178447759733440523> 🎉"))).toBe(true);
    expect(isJumboEmoji(parseDiscordMarkdown("hi 🎉"))).toBe(false);
    expect(isJumboEmoji(parseDiscordMarkdown(""))).toBe(false);
  });
});
