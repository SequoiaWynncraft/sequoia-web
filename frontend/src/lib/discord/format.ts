/**
 * Pure helpers behind the editor and preview: Discord's message limits,
 * timestamp wording and inline-field grid. Rust remains the validation
 * authority; these give staff the same answer before they press Save.
 */

import emojiRegex from "emoji-regex";
import type { TimestampFormat } from "./markdown";
import type { Definition, Embed } from "./types";

export const LIMITS = {
  name: 100,
  content: 2000,
  embeds: 10,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  embedTotal: 6000,
  rows: 5,
  buttonsPerRow: 5,
  label: 80,
  buttonUrl: 512,
} as const;

/** Discord hides attached images consumed by an embed's image or thumbnail. */
export function standaloneAttachments(draft: Definition) {
  const consumed = new Set(draft.embeds.flatMap((embed) => [embed.image?.url, embed.thumbnail?.url])
    .filter((url): url is string => !!url?.startsWith("attachment://")).map((url) => url.slice(13)));
  return (draft.attachments ?? []).filter((attachment) => !consumed.has(attachment.filename));
}

/** Discord counts characters, not UTF-16 units: an emoji is one. */
export function charCount(text: string | undefined): number {
  return text ? [...text].length : 0;
}

/**
 * Embed text as Sierra stores it: Unicode White_Space trimmed from both ends, like Rust's
 * `str::trim`. `String.trim` differs at U+0085 (kept) and U+FEFF (removed).
 */
export function trimEmbedText(text: string | undefined): string {
  return (text ?? "").replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
}

/** Discord trims surrounding whitespace from embed text before measuring limits. */
export function embedCount(text: string | undefined): number {
  return charCount(trimEmbedText(text));
}

/** Shortens by characters, never splitting an emoji's surrogate pair. */
export function truncateChars(text: string, limit: number): string {
  return [...text].slice(0, limit).join("");
}

export function embedCharacters(embed: Embed): number {
  return (
    embedCount(embed.title) +
    embedCount(embed.description) +
    embedCount(embed.author?.name) +
    embedCount(embed.footer?.text) +
    (embed.fields ?? []).reduce((sum, field) => sum + embedCount(field.name) + embedCount(field.value), 0)
  );
}

export function isWebUrl(raw: string | undefined): boolean {
  try {
    const url = new URL(raw ?? "");
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Problems keyed by the draft path they belong to, e.g. `embeds.0.fields.1.value`. */
export type Issues = Record<string, string>;

function tooLong(issues: Issues, key: string, label: string, text: string | undefined, limit: number, measure = charCount) {
  const count = measure(text);
  if (count > limit) issues[key] = `${label} is ${count} characters; Discord allows ${limit}.`;
}

function url(issues: Issues, key: string, raw: string | undefined) {
  if (raw && !isWebUrl(raw)) issues[key] = "Use a full http or https link.";
}

function unicodeEmoji(name: string): boolean {
  const value = name.replaceAll("\uFE0F", "");
  // Match Rust's Unicode 17 lookup; components alone are not complete emoji.
  return !/^\p{Emoji_Component}$/u.test(value) && emojiRegex().exec(value)?.[0] === value;
}

/** What the current context offers; an omitted set is not checked. */
export interface Availability {
  /** Eligible, approved self-service roles. */
  roles?: ReadonlySet<string>;
  channels?: ReadonlySet<string>;
  /** Server emoji Discord currently marks available. */
  emojis?: ReadonlySet<string>;
}

export function definitionIssues(draft: Definition, available: Availability = {}): Issues {
  const issues: Issues = {};
  if (!draft.name.trim()) issues.name = "Give the message a name.";
  tooLong(issues, "name", "The name", draft.name, LIMITS.name);
  if (!draft.channel_id) issues.channel_id = "Choose a channel.";
  else if (available.channels && !available.channels.has(draft.channel_id)) issues.channel_id = "Choose an available channel.";
  tooLong(issues, "content", "Message text", draft.content, LIMITS.content);
  if (!draft.content.trim() && draft.embeds.length === 0 && !draft.rows.some((row) => row.length > 0) && !draft.components_v2?.length && !draft.attachments?.length) issues.content = "Add message text, an embed or a button.";
  if (draft.components_v2?.length) {
    let characters = 0, nodes = 0;
    const visit = (components: NonNullable<Definition["components_v2"]>) => {
      for (const component of components) {
        nodes += 1;
        if (component.type === 10) { characters += charCount(component.content); if (!component.content.trim()) issues.components_v2 = "Give every text block content."; }
        else if (component.type === 17) { if (!component.components.length) issues.components_v2 = "Give every container content."; visit(component.components); }
      }
    };
    visit(draft.components_v2);
    if (characters > 4000 || nodes > 40) issues.components_v2 = "Layout panels allow 4000 text characters and 40 components together.";
  }
  if ((draft.attachments?.length ?? 0) > 10) issues.attachments = "A message can have at most 10 attachments.";
  let total = 0;
  const embedUrls = new Set<string>();
  draft.embeds.forEach((embed, index) => {
    const at = `embeds.${index}`;
    tooLong(issues, `${at}.title`, "The title", embed.title, LIMITS.title, embedCount);
    tooLong(issues, `${at}.description`, "The description", embed.description, LIMITS.description, embedCount);
    tooLong(issues, `${at}.author`, "The author", embed.author?.name, LIMITS.author, embedCount);
    tooLong(issues, `${at}.footer`, "The footer", embed.footer?.text, LIMITS.footer, embedCount);
    if (embed.author && !trimEmbedText(embed.author.name)) issues[`${at}.author`] = "Authors need a name.";
    if (embed.footer && !trimEmbedText(embed.footer.text)) issues[`${at}.footer`] = "Footers need text.";
    url(issues, `${at}.url`, embed.url);
    if (embed.url) {
      if (embedUrls.has(embed.url)) issues[`${at}.url`] = "Discord shows only the first embed with this link. Use a different link or remove it.";
      embedUrls.add(embed.url);
    }
    for (const [part, raw] of [["image", embed.image?.url], ["thumbnail", embed.thumbnail?.url]] as const) {
      if (raw?.startsWith("attachment://")) { if (!draft.attachments?.some((a) => a.filename === raw.slice(13))) issues[`${at}.${part}`] = "Choose an attachment belonging to this message."; }
      else url(issues, `${at}.${part}`, raw);
    }
    url(issues, `${at}.author_url`, embed.author?.url);
    url(issues, `${at}.author_icon`, embed.author?.icon_url);
    url(issues, `${at}.footer_icon`, embed.footer?.icon_url);
    if (embed.timestamp && Number.isNaN(Date.parse(embed.timestamp))) issues[`${at}.timestamp`] = "Choose a valid date and time.";
    const visible = trimEmbedText(embed.title) || trimEmbedText(embed.description) || trimEmbedText(embed.author?.name) || trimEmbedText(embed.footer?.text) ||
      embed.image?.url || embed.thumbnail?.url || (embed.fields?.length ?? 0) > 0 ||
      (embed.timestamp && !Number.isNaN(Date.parse(embed.timestamp)));
    if (!visible) issues[at] = "Give this embed a title, description, field, image, footer or timestamp.";
    (embed.fields ?? []).forEach((field, fieldIndex) => {
      const key = `${at}.fields.${fieldIndex}`;
      if (!trimEmbedText(field.name)) issues[`${key}.name`] = "Fields need a name.";
      if (!trimEmbedText(field.value)) issues[`${key}.value`] = "Fields need a value.";
      tooLong(issues, `${key}.name`, "The field name", field.name, LIMITS.fieldName, embedCount);
      tooLong(issues, `${key}.value`, "The field value", field.value, LIMITS.fieldValue, embedCount);
    });
    total += embedCharacters(embed);
  });
  if (total > LIMITS.embedTotal) {
    issues.embeds = `Embeds hold ${total} characters together; Discord allows ${LIMITS.embedTotal}.`;
  }
  draft.rows.forEach((row, rowIndex) => {
    if (row.length === 0) issues[`rows.${rowIndex}`] = "Add a button or remove this row.";
    row.forEach((button, index) => {
      const key = `rows.${rowIndex}.${index}`;
      if (!button.label.trim() && !button.emoji) issues[`${key}.label`] = "Give the button a label or an emoji.";
      if (button.emoji && !("id" in button.emoji) && !unicodeEmoji(button.emoji.name)) {
        issues[`${key}.emoji`] = "Use a single Unicode emoji or choose a server emoji.";
      }
      if (button.emoji && "id" in button.emoji && available.emojis && !available.emojis.has(button.emoji.id)) {
        issues[`${key}.server_emoji`] = "This server emoji is no longer available. Choose another or remove it.";
      }
      tooLong(issues, `${key}.label`, "The label", button.label, LIMITS.label);
      if (button.action.kind === "role") {
        if (!button.action.role_id) issues[`${key}.role`] = "Choose a role.";
        else if (available.roles && !available.roles.has(button.action.role_id)) issues[`${key}.role`] = "Choose an enabled self-service role.";
      } else {
        if (!isWebUrl(button.action.url)) issues[`${key}.url`] = "Use a full http or https link.";
        tooLong(issues, `${key}.url`, "The link", button.action.url, LIMITS.buttonUrl);
      }
    });
  });
  return issues;
}

/** Issue lookups for one subtree, e.g. everything under `embeds.0`. */
export function issuesUnder(issues: Issues, prefix: string): string[] {
  return Object.entries(issues)
    .filter(([key]) => key === prefix || key.startsWith(`${prefix}.`))
    .map(([, message]) => message);
}

/**
 * Discord's embed field grid: consecutive inline fields share a row of up to
 * three (two beside a thumbnail) and split twelve columns evenly; a non-inline
 * field takes a full row.
 */
export function fieldColumns(fields: { inline: boolean }[], hasThumbnail: boolean): string[] {
  const perRow = hasThumbnail ? 2 : 3;
  const columns: string[] = [];
  let run: number[] = [];
  const flush = () => {
    for (let start = 0; start < run.length; start += perRow) {
      const row = run.slice(start, start + perRow);
      const span = 12 / row.length;
      row.forEach((fieldIndex, position) => {
        columns[fieldIndex] = `${1 + position * span} / ${1 + (position + 1) * span}`;
      });
    }
    run = [];
  };
  fields.forEach((field, index) => {
    if (field.inline) {
      run.push(index);
    } else {
      flush();
      columns[index] = "1 / 13";
    }
  });
  flush();
  return columns;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400],
  ["month", 30 * 86_400],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

/** Discord's `<t:…:style>` wording, in the reader's locale and time zone. */
export function formatTimestamp(
  seconds: number,
  format: TimestampFormat,
  now = Date.now(),
  locale?: string,
): string {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  if (format === "R") {
    const delta = seconds - now / 1000;
    const [unit, size] = RELATIVE_UNITS.find(([, length]) => Math.abs(delta) >= length) ?? ["second", 1];
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(delta / size), unit);
  }
  const options: Record<Exclude<TimestampFormat, "R">, Intl.DateTimeFormatOptions> = {
    t: { hour: "2-digit", minute: "2-digit" },
    T: { hour: "2-digit", minute: "2-digit", second: "2-digit" },
    d: { day: "2-digit", month: "2-digit", year: "numeric" },
    D: { day: "numeric", month: "long", year: "numeric" },
    f: { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" },
    F: { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" },
  };
  return new Intl.DateTimeFormat(locale, options[format]).format(date);
}

/** "Today at 12:00", "Yesterday at 12:00" or a short date, like Discord's message and footer times. */
export function calendarTime(at: Date, now = new Date(), locale?: string): string {
  if (Number.isNaN(at.getTime())) return "";
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(at);
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const difference = Math.round((day(now) - day(at)) / 86_400_000);
  if (difference === 0) return `Today at ${time}`;
  if (difference === 1) return `Yesterday at ${time}`;
  const date = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(at);
  return `${date} ${time}`;
}

/** `<input type="datetime-local">` value for an ISO timestamp, in local time. */
export function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** ISO timestamp (with zone) for a local `datetime-local` value. */
export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

export function hexColor(value: number | undefined): string {
  return `#${(value ?? 0).toString(16).padStart(6, "0")}`;
}

export function parseHexColor(raw: string): number | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(raw.trim());
  return match ? Number.parseInt(match[1], 16) : undefined;
}
