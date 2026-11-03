/**
 * Sequoia's custom emojis - a hard allowlist, like the prize and raid icons.
 * Authors write `:name:` in post bodies and event text; an unknown name stays
 * plain text. Adding one is dropping `<name>.webp` in static/assets/emoji and
 * listing it here.
 */
export interface Emoji {
  /** Shortcode and file stem. */
  name: string;
  /** Picker caption. */
  label: string;
}

export const EMOJIS: Emoji[] = [
  { name: "verdant", label: "Verdant" },
  { name: "new", label: "New" },
  { name: "le", label: "LE" },
  { name: "aspect", label: "Aspect" },
  { name: "bm", label: "BM" },
  { name: "cat_love", label: "Cat love" },
  { name: "cat_facepalm", label: "Cat facepalm" },
  { name: "steam_happy", label: "Steam happy" },
  { name: "archer", label: "Archer" },
  { name: "assassin", label: "Assassin" },
  { name: "mage", label: "Mage" },
  { name: "shaman", label: "Shaman" },
  { name: "warrior", label: "Warrior" },
  { name: "bronze_insignia", label: "Bronze insignia" },
  { name: "silver_insignia", label: "Silver insignia" },
  { name: "gold_insignia", label: "Gold insignia" },
  { name: "diamond_insignia", label: "Diamond insignia" },
  { name: "one_star", label: "One star" },
  { name: "two_stars", label: "Two stars" },
  { name: "three_stars", label: "Three stars" },
  { name: "good_three_stars", label: "Good three stars" },
  { name: "four_stars", label: "Four stars" },
  { name: "five_stars", label: "Five stars" },
  { name: "special_five_stars", label: "Special five stars" },
];

const NAMES = new Set(EMOJIS.map((emoji) => emoji.name));
const SHORTCODE = /:([a-z0-9_]+):/y;

export function emojiUrl(name: string): string {
  return `/assets/emoji/${name}.webp`;
}

function isEmoji(name: string): boolean {
  return NAMES.has(name);
}

/** The known emoji whose `:name:` starts at `index`, or null. */
export function emojiAt(text: string, index: number): string | null {
  SHORTCODE.lastIndex = index;
  const match = SHORTCODE.exec(text);
  return match && isEmoji(match[1]) ? match[1] : null;
}

export type EmojiPart = { type: "text"; text: string } | { type: "emoji"; name: string };

/** Splits plain text around known shortcodes, for fields without markdown. */
export function splitEmoji(text: string): EmojiPart[] {
  const parts: EmojiPart[] = [];
  let buffer = "";
  let index = 0;
  while (index < text.length) {
    const name = text[index] === ":" ? emojiAt(text, index) : null;
    if (name) {
      if (buffer) parts.push({ type: "text", text: buffer });
      buffer = "";
      parts.push({ type: "emoji", name });
      index += name.length + 2;
      continue;
    }
    buffer += text[index];
    index += 1;
  }
  if (buffer) parts.push({ type: "text", text: buffer });
  return parts;
}
