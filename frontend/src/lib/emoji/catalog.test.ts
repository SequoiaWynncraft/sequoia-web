import { describe, expect, it } from "vitest";

import { EMOJIS, emojiAt, splitEmoji } from "./catalog";

describe("emoji catalog", () => {
  it("has unique shortcode names", () => {
    const names = EMOJIS.map((emoji) => emoji.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z0-9_]+$/);
  });

  it("only matches a known shortcode starting at the index", () => {
    expect(emojiAt("a :le: b", 2)).toBe("le");
    expect(emojiAt("a :le: b", 0)).toBeNull();
    expect(emojiAt(":unknown:", 0)).toBeNull();
  });

  it("splits plain text around known shortcodes", () => {
    expect(splitEmoji("GG :cat_love::verdant: :x: 10:00:")).toEqual([
      { type: "text", text: "GG " },
      { type: "emoji", name: "cat_love" },
      { type: "emoji", name: "verdant" },
      { type: "text", text: " :x: 10:00:" },
    ]);
    expect(splitEmoji("")).toEqual([]);
  });
});
