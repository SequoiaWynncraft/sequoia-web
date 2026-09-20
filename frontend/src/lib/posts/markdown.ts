/**
 * Light markdown for post bodies. Parses to a token tree that PostBody renders
 * as elements - nothing here produces HTML, so an author cannot inject markup,
 * and a link only becomes a link when its target is http(s) or site-relative.
 *
 * Supported: blank-line paragraphs (a single newline is a line break), `#`/`##`
 * and `###` headings, `-`/`*` and `1.` lists, `>` quotes, **bold**, *italic* or
 * _italic_, `code`, [text](url), :emoji: from the Sequoia catalog, and backslash
 * escapes. Anything else is text.
 */

import { emojiAt } from "$lib/emoji/catalog";

export type Inline =
  | { type: "text"; text: string }
  | { type: "break" }
  | { type: "code"; text: string }
  | { type: "emoji"; name: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; external: boolean; children: Inline[] };

export type Block =
  | { type: "heading"; level: 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "quote"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

const HEADING = /^(#{1,3})\s+(.+)$/;
const BULLET = /^\s*[-*]\s+(.+)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.+)$/;
const QUOTE = /^>\s?(.*)$/;
const ESCAPABLE = new Set(["\\", "*", "_", "`", "[", "]", "(", ")", "#", "-", ">", ":"]);
const WORD_CHAR = /[\p{L}\p{N}]/u;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  // At most one of the three is open at a time; flushing closes whichever it is.
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", children: parseLines(paragraph) });
    if (quote.length > 0) blocks.push({ type: "quote", children: parseLines(quote) });
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    paragraph = [];
    quote = [];
    list = null;
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1].length === 3 ? 3 : 2,
        children: parseInline(heading[2].trim()),
      });
      continue;
    }

    const numbered = NUMBERED.exec(line);
    const item = numbered ?? BULLET.exec(line);
    if (item) {
      const ordered = numbered !== null;
      if (list === null || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(item[1].trim());
      continue;
    }

    const quoted = QUOTE.exec(line);
    if (quoted) {
      if (quote.length === 0) flush();
      quote.push(quoted[1]);
      continue;
    }

    if (paragraph.length === 0) flush();
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

function parseLines(lines: string[]): Inline[] {
  return lines.flatMap((line, index) =>
    index === 0 ? parseInline(line) : [{ type: "break" } as const, ...parseInline(line)],
  );
}

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let buffer = "";
  const flushText = () => {
    if (buffer) nodes.push({ type: "text", text: buffer });
    buffer = "";
  };

  let index = 0;
  while (index < text.length) {
    const char = text[index];

    if (char === "\\" && ESCAPABLE.has(text[index + 1])) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }

    if (char === "`") {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        flushText();
        nodes.push({ type: "code", text: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end > index + 2) {
        flushText();
        nodes.push({ type: "strong", children: parseInline(text.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }

    if ((char === "*" || char === "_") && opensEmphasis(text, index)) {
      const end = closingEmphasis(text, char, index + 1);
      if (end !== -1) {
        flushText();
        nodes.push({ type: "em", children: parseInline(text.slice(index + 1, end)) });
        index = end + 1;
        continue;
      }
    }

    if (char === ":") {
      const name = emojiAt(text, index);
      if (name) {
        flushText();
        nodes.push({ type: "emoji", name });
        index += name.length + 2;
        continue;
      }
    }

    if (char === "[") {
      const link = parseLink(text, index);
      if (link) {
        flushText();
        nodes.push(link.node);
        index = link.end;
        continue;
      }
    }

    buffer += char;
    index += 1;
  }
  flushText();
  return nodes;
}

/** Emphasis opens before a non-space; `_` additionally never mid-word (snake_case). */
function opensEmphasis(text: string, index: number): boolean {
  const next = text[index + 1];
  if (next === undefined || /\s/.test(next)) return false;
  return text[index] === "*" || !WORD_CHAR.test(text[index - 1] ?? "");
}

/** The closing marker after at least one character: a lone `*` (not half of `**`) or a word-final `_`. */
function closingEmphasis(text: string, marker: string, contentStart: number): number {
  for (let index = contentStart + 1; index < text.length; index += 1) {
    if (text[index] !== marker) continue;
    if (marker === "*" && text[index + 1] === "*") {
      index += 1;
      continue;
    }
    if (/\s/.test(text[index - 1])) continue;
    if (marker === "_" && WORD_CHAR.test(text[index + 1] ?? "")) continue;
    return index;
  }
  return -1;
}

function parseLink(text: string, start: number): { node: Inline; end: number } | null {
  const close = text.indexOf("](", start + 1);
  if (close === -1) return null;
  const end = text.indexOf(")", close + 2);
  if (end === -1) return null;
  const label = text.slice(start + 1, close);
  const target = safeHref(text.slice(close + 2, end));
  if (!label.trim() || !target) return null;
  return { node: { type: "link", ...target, children: parseInline(label) }, end: end + 1 };
}

const SITE_BASE = "https://placeholder.invalid";

/** http(s) and site-relative paths only - never javascript:, data:, or protocol-relative. */
export function safeHref(raw: string): { href: string; external: boolean } | null {
  const href = raw.trim();
  if (href.startsWith("/")) {
    // Browsers strip tabs/newlines before navigating, so "/\t/evil" would become "//evil".
    if (href.startsWith("//") || href.includes("\\") || /[\s\p{Cc}]/u.test(href)) return null;
    try {
      return new URL(href, SITE_BASE).origin === SITE_BASE ? { href, external: false } : null;
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:"
      ? { href: url.href, external: true }
      : null;
  } catch {
    return null;
  }
}
