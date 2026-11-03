import shortcodeData from "emojibase-data/en/shortcodes/joypixels.json";

import { SimpleMarkdown, rulesExtended, type Capture, type ParserRule, type SingleASTNode } from "./parser";

export type TimestampFormat = "t" | "T" | "d" | "D" | "f" | "F" | "R";

export type DiscordNode =
  | { type: "text"; text: string }
  | { type: "br" }
  | { type: "strong" | "em" | "underline" | "strike" | "spoiler"; children: DiscordNode[] }
  | { type: "inlineCode"; text: string }
  | { type: "codeBlock"; lang: string; text: string }
  | { type: "blockQuote"; children: DiscordNode[] }
  | { type: "heading"; level: 1 | 2 | 3; children: DiscordNode[] }
  | { type: "subtext"; children: DiscordNode[] }
  | { type: "list"; ordered: boolean; start: number; items: DiscordNode[][] }
  | { type: "link"; href: string; children: DiscordNode[] }
  | { type: "mention"; kind: "user" | "role" | "channel"; id: string }
  | { type: "mention"; kind: "everyone" | "here" }
  | { type: "mention"; kind: "command" | "navigation"; name: string }
  | { type: "emoji"; name: string; id: string | null; animated: boolean }
  | { type: "timestamp"; seconds: number; format: TimestampFormat };

export type MarkdownSurface = "content" | "title";

const ITEM = /^( *)([-*]|\d{1,9}\.) +(\S[^\n]*)(?:\n|$)/;

const SHORTCODES = new Map(
  Object.entries(shortcodeData).flatMap(([hex, names]) => {
    const unicode = String.fromCodePoint(...hex.split("-").map((point) => Number.parseInt(point, 16)));
    return (Array.isArray(names) ? names : [names]).map((name) => [name, unicode] as const);
  }),
);
const shortcode: ParserRule = {
  order: rulesExtended.twemoji.order,
  match(source) {
    const capture = /^:([a-zA-Z0-9_+-]+):/.exec(source);
    return capture && SHORTCODES.has(capture[1]) ? capture as Capture : null;
  },
  parse: (capture) => ({ name: SHORTCODES.get(capture[1]) }),
};

const list: ParserRule = {
  order: SimpleMarkdown.defaultRules.list.order,
  match(source, _state, previous) {
    if (!/(?:^|\n) *$/.test(previous)) return null;
    const first = ITEM.exec(source);
    if (!first) return null;
    const base = first[1].length;
    const ordered = /\d/.test(first[2]);
    let end = first[0].length;
    for (let next; end < source.length && (next = ITEM.exec(source.slice(end))); end += next[0].length) {
      const indent = next[1].length;
      if (indent < base || (indent === base && /\d/.test(next[2]) !== ordered)) break;
    }
    return /^[\s\S]*/.exec(source.slice(0, end)) as Capture;
  },
  parse(capture, parse, state) {
    const lines = capture[0].replace(/\n$/, "").split("\n");
    const head = ITEM.exec(lines[0]);
    const base = head?.[1].length ?? 0;
    const items: SingleASTNode[][] = [];
    let nested: string[] = [];
    const closeNested = () => {
      const owner = items.at(-1);
      if (owner && nested.length > 0) {
        const indent = Math.min(...nested.map((line) => /^ */.exec(line)?.[0].length ?? 0));
        const source = `${nested.map((line) => line.slice(indent)).join("\n")}\n`;
        owner.push(...parse(source, { ...state, prevCapture: null }));
      }
      nested = [];
    };
    for (const line of lines) {
      const item = ITEM.exec(line);
      if (!item) continue;
      if (item[1].length > base) {
        nested.push(line);
        continue;
      }
      closeNested();
      items.push(parse(item[3], state));
    }
    closeNested();
    const start = Number.parseInt(head?.[2] ?? "", 10);
    return { ordered: !Number.isNaN(start), start: Number.isNaN(start) ? 1 : start, items };
  },
};

/**
 * The parser's heading and subtext rules test the last regex group of the
 * previous capture instead of its last character, so a heading directly after
 * a quote or list is missed. Discord renders it; decide line starts here.
 */
function atLineStart(rule: ParserRule): ParserRule {
  return {
    ...rule,
    match: (source, state, previous) =>
      /(?:^|\n)$/.test(previous) ? rule.match(source, { ...state, prevCapture: null }, previous) : null,
  };
}

const contentParser = SimpleMarkdown.parserFor({
  ...rulesExtended,
  heading: atLineStart(rulesExtended.heading),
  subtext: atLineStart(rulesExtended.subtext),
  list,
  shortcode,
});

const TITLE_RULES = [
  "escape", "em", "strong", "underline", "strikethrough", "inlineCode", "spoiler",
  "emoji", "twemoji", "text", "newline", "br",
] as const;
const titleParser = SimpleMarkdown.parserFor(
  {
    ...Object.fromEntries(TITLE_RULES.map((name) => [name, rulesExtended[name]])),
    shortcode,
    literalUrl: { ...rulesExtended.url, parse: (capture) => ({ content: capture[0] }) },
  },
);

const GUILD_NAVIGATION: Record<string, string> = {
  customize: "Channels & Roles",
  browse: "Browse Channels",
  guide: "Server Guide",
  "linked-roles": "Linked Roles",
};
const FORMATS = new Set<string>(["t", "T", "d", "D", "f", "F", "R"]);

export function parseDiscordMarkdown(source: string, surface: MarkdownSurface = "content"): DiscordNode[] {
  const parser = surface === "title" ? titleParser : contentParser;
  return normalize(parser(source.replace(/\r\n?/g, "\n"), { inline: true }));
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeHref(raw: unknown): string | null {
  try {
    const url = new URL(str(raw));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function children(node: SingleASTNode): DiscordNode[] {
  return Array.isArray(node.content) ? normalize(node.content) : [{ type: "text", text: str(node.content) }];
}

function convert(node: SingleASTNode): DiscordNode | DiscordNode[] {
  switch (node.type) {
    case "text":
    case "emoticon":
      return { type: "text", text: str(node.content) };
    case "br":
    case "newline":
      return { type: "br" };
    case "strong":
    case "em":
    case "underline":
    case "spoiler":
      return { type: node.type, children: children(node) };
    case "strikethrough":
      return { type: "strike", children: children(node) };
    case "inlineCode":
      return { type: "inlineCode", text: str(node.content) };
    case "codeBlock":
      return { type: "codeBlock", lang: str(node.lang), text: str(node.content) };
    case "blockQuote": {
      const quoted = children(node);
      if (quoted.at(-1)?.type === "br") quoted.pop();
      return { type: "blockQuote", children: quoted };
    }
    case "heading": {
      const level = node.level === 1 || node.level === 2 || node.level === 3 ? node.level : 3;
      return { type: "heading", level, children: children(node) };
    }
    case "subtext":
      return { type: "subtext", children: children(node) };
    case "list":
      return {
        type: "list",
        ordered: node.ordered === true,
        start: typeof node.start === "number" ? node.start : 1,
        items: Array.isArray(node.items) ? node.items.map((item: SingleASTNode[]) => normalize(item)) : [],
      };
    case "link":
    case "url":
    case "autolink": {
      const href = safeHref(node.target ?? (Array.isArray(node.content) ? node.content[0]?.content : node.content));
      return href ? { type: "link", href, children: children(node) } : children(node);
    }
    case "user":
    case "role":
    case "channel":
      return { type: "mention", kind: node.type, id: str(node.id) };
    case "everyone":
    case "here":
      return { type: "mention", kind: node.type };
    case "slashCommand":
      return { type: "mention", kind: "command", name: str(node.fullName) || str(node.name) };
    case "guildNavigation":
      return { type: "mention", kind: "navigation", name: GUILD_NAVIGATION[str(node.id)] ?? str(node.id) };
    case "emoji":
      return { type: "emoji", name: str(node.name), id: str(node.id), animated: node.animated === true };
    case "twemoji":
    case "shortcode":
      return { type: "emoji", name: str(node.name), id: null, animated: false };
    case "timestamp": {
      const seconds = Number(node.timestamp);
      const format = FORMATS.has(str(node.format)) ? (node.format as TimestampFormat) : "f";
      if (!Number.isNaN(new Date(seconds * 1000).getTime())) return { type: "timestamp", seconds, format };
      return { type: "text", text: `<t:${str(node.timestamp)}${node.format ? `:${str(node.format)}` : ""}>` };
    }
    default:
      return Array.isArray(node.content) ? normalize(node.content) : { type: "text", text: str(node.content) };
  }
}

const BLOCKS = new Set<DiscordNode["type"]>(["codeBlock", "blockQuote", "heading", "subtext", "list"]);

function normalize(nodes: SingleASTNode[]): DiscordNode[] {
  const out: DiscordNode[] = [];
  for (const converted of nodes.flatMap(convert)) {
    const last = out.at(-1);
    if (converted.type === "text" && last?.type === "text") last.text += converted.text;
    else if (converted.type === "br" && last && BLOCKS.has(last.type)) continue;
    else if (converted.type !== "text" || converted.text !== "") out.push(converted);
  }
  return out;
}

export function isJumboEmoji(nodes: DiscordNode[]): boolean {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "emoji") count += 1;
    else if (!(node.type === "text" && node.text.trim() === "")) return false;
  }
  return count > 0 && count <= 30;
}
