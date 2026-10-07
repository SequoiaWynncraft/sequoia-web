/**
 * Pure helpers behind the editor and preview: Discord's message limits,
 * timestamp wording and inline-field grid. Rust remains the validation
 * authority; these give staff the same answer before they press Save.
 */

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

/** Discord counts characters, not UTF-16 units: an emoji is one. */
export function charCount(text: string | undefined): number {
  return text ? [...text].length : 0;
}

export function embedCharacters(embed: Embed): number {
  return (
    charCount(embed.title) +
    charCount(embed.description) +
    charCount(embed.author?.name) +
    charCount(embed.footer?.text) +
    (embed.fields ?? []).reduce((sum, field) => sum + charCount(field.name) + charCount(field.value), 0)
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

function tooLong(issues: Issues, key: string, label: string, text: string | undefined, limit: number) {
  const count = charCount(text);
  if (count > limit) issues[key] = `${label} is ${count} characters; Discord allows ${limit}.`;
}

function url(issues: Issues, key: string, raw: string | undefined) {
  if (raw && !isWebUrl(raw)) issues[key] = "Use a full http or https link.";
}

export function definitionIssues(draft: Definition, selfServiceRoleIds?: ReadonlySet<string>): Issues {
  const issues: Issues = {};
  if (!draft.name.trim()) issues.name = "Give the message a name.";
  tooLong(issues, "name", "The name", draft.name, LIMITS.name);
  if (!draft.channel_id) issues.channel_id = "Choose a channel.";
  tooLong(issues, "content", "Message text", draft.content, LIMITS.content);
  if (!draft.content.trim() && draft.embeds.length === 0 && !draft.rows.some((row) => row.length > 0)) issues.content = "Add message text, an embed or a button.";
  let total = 0;
  draft.embeds.forEach((embed, index) => {
    const at = `embeds.${index}`;
    tooLong(issues, `${at}.title`, "The title", embed.title, LIMITS.title);
    tooLong(issues, `${at}.description`, "The description", embed.description, LIMITS.description);
    tooLong(issues, `${at}.author`, "The author", embed.author?.name, LIMITS.author);
    tooLong(issues, `${at}.footer`, "The footer", embed.footer?.text, LIMITS.footer);
    if (embed.author && !embed.author.name.trim()) issues[`${at}.author`] = "Authors need a name.";
    if (embed.footer && !embed.footer.text.trim()) issues[`${at}.footer`] = "Footers need text.";
    url(issues, `${at}.url`, embed.url);
    url(issues, `${at}.image`, embed.image?.url);
    url(issues, `${at}.thumbnail`, embed.thumbnail?.url);
    url(issues, `${at}.author_url`, embed.author?.url);
    url(issues, `${at}.author_icon`, embed.author?.icon_url);
    url(issues, `${at}.footer_icon`, embed.footer?.icon_url);
    if (embed.timestamp && Number.isNaN(Date.parse(embed.timestamp))) issues[`${at}.timestamp`] = "Choose a valid date and time.";
    const visible = embed.title || embed.description || embed.author?.name || embed.footer?.text ||
      embed.image?.url || embed.thumbnail?.url || (embed.fields?.length ?? 0) > 0;
    if (!visible) issues[at] = "Give this embed a title, description, field, image or footer.";
    (embed.fields ?? []).forEach((field, fieldIndex) => {
      const key = `${at}.fields.${fieldIndex}`;
      if (!field.name.trim()) issues[`${key}.name`] = "Fields need a name.";
      if (!field.value.trim()) issues[`${key}.value`] = "Fields need a value.";
      tooLong(issues, `${key}.name`, "The field name", field.name, LIMITS.fieldName);
      tooLong(issues, `${key}.value`, "The field value", field.value, LIMITS.fieldValue);
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
      tooLong(issues, `${key}.label`, "The label", button.label, LIMITS.label);
      if (button.action.kind === "role") {
        if (!button.action.role_id) issues[`${key}.role`] = "Choose a role.";
        else if (selfServiceRoleIds && !selfServiceRoleIds.has(button.action.role_id)) issues[`${key}.role`] = "Choose an enabled self-service role.";
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
