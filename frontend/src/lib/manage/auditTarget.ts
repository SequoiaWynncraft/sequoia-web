import type { AuditEntry } from "$lib/server/auditLog";
import { welcomeNightSummary } from "$lib/discord/welcome";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function snowflake(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value)
    && BigInt(value) <= 18446744073709551615n;
}

export function messageLink(entry: Pick<AuditEntry, "source" | "detail" | "action">): string | null {
  if (entry.source !== "discord" || !entry.detail) return null;
  try {
    const change = object(JSON.parse(entry.detail));
    if (!change) return null;
    const after = object(change.after);
    const before = object(change.before);
    const bindings = [after, before, change];
    const sources = bindings.map((target) => object(target?.source));
    const sourceAction = /\.message\.(adopt|retire-source)(\.|$)/.test(entry.action);
    for (const target of sourceAction ? [...sources, ...bindings] : [...bindings, ...sources]) {
      if (!target) continue;
      const ids = [target.guild_id, target.channel_id, target.message_id];
      if (ids.every(snowflake)) return `https://discord.com/channels/${ids.join("/")}`;
    }
  } catch { /* Malformed historical details have no navigable target. */ }
  return null;
}

export interface AuditChange { label: string; before: string; after: string }

const WELCOME_LABELS: Record<string, string> = {
  enabled: "Automatic welcomes", channel_id: "Destination channel", season_mode: "Season mode",
  winter_start: "Winter start", winter_end: "Winter end", variants: "Welcome odds", links: "Welcome links",
  message: "Message text", name_font: "Name font", effects: "Sky effects", night: "Night schedule",
  mention_member: "Mention member",
};
const SEASON_MODES: Record<string, string> = { automatic: "Automatic", normal: "Always normal", winter: "Always winter" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Stable ids read as names even when they postdate this view, e.g. gnome_party as Gnome party. */
function readableId(value: unknown): string {
  if (typeof value !== "string" || !value) return "Unknown";
  const words = value.replaceAll("_", " ");
  return words[0].toUpperCase() + words.slice(1);
}

function variantRows(value: unknown): Map<string, string> {
  const rows = new Map<string, string>();
  if (!Array.isArray(value)) return rows;
  for (const row of value.map(object)) {
    if (row && typeof row.id === "string") rows.set(row.id, `${readableId(row.id)} ${row.enabled === true ? "on" : "off"}, weight ${String(row.weight)}`);
  }
  return rows;
}

function welcomeValue(key: string, value: unknown, other: unknown): string {
  if (value === undefined || value === null) return "Not set";
  // Snapshots from before mention_member existed recorded no choice (those senders did ping),
  // so an absent value stays "Not set" above rather than reading as Off.
  if (key === "mention_member") return value === true ? "On" : "Off";
  const record = object(value);
  switch (key) {
    case "enabled": return value === true ? "On" : "Off";
    case "season_mode": return SEASON_MODES[String(value)] ?? readableId(value);
    case "winter_start": case "winter_end":
      return record && typeof record.month === "number" && MONTHS[record.month - 1] ? `${String(record.day)} ${MONTHS[record.month - 1]}` : "Not set";
    case "name_font": return readableId(value);
    case "message": return record ? `"${String(record.headline)}" / "${String(record.subtitle)}", ${readableId(record.font)} font` : "Not set";
    case "effects": {
      const sky = Array.isArray(record?.sky) ? record.sky.map(object) : [];
      return sky.map((effect) => `${readableId(effect?.id)} ${String(effect?.percent)}%`).join(", ") || "No sky effects";
    }
    case "night": {
      if (!record || typeof record.start !== "string" || typeof record.end !== "string" || typeof record.timezone !== "string") return "Not set";
      const interval = welcomeNightSummary({ start: record.start, end: record.end, timezone: record.timezone }) ?? `Night from ${record.start} to ${record.end} (${record.timezone})`;
      return `${record.enabled === true ? "On" : "Off"}. ${interval}. ${record.moon === false ? "No moon" : "Moon shown"}.`;
    }
    case "variants": {
      // Only rows that differ, so added catalog entries and single odds edits stay readable.
      const mine = variantRows(value);
      const theirs = variantRows(other);
      const changed = [...mine].filter(([id, row]) => theirs.get(id) !== row).map(([, row]) => row);
      const missing = [...theirs.keys()].filter((id) => !mine.has(id)).map((id) => `${readableId(id)} not listed`);
      return [...changed, ...missing].join("; ") || "Unchanged";
    }
    default: return typeof value === "string" ? value : JSON.stringify(value);
  }
}

/** Readable welcome settings changes from the Rust audit snapshot. The raw detail stays available. */
export function welcomeAuditChanges(entry: Pick<AuditEntry, "source" | "detail" | "action">): AuditChange[] | null {
  if (entry.source !== "discord" || !entry.detail || !entry.action.endsWith("welcome.settings.save")) return null;
  try {
    const change = object(JSON.parse(entry.detail));
    if (!change || !Array.isArray(change.changed)) return null;
    const before = object(change.before) ?? {};
    const after = object(change.after) ?? {};
    return change.changed.filter((key): key is string => typeof key === "string").map((key) => {
      // Audit snapshots summarize links by count rather than storing every URL twice.
      const field = key === "links" ? "link_count" : key;
      const value = (side: Record<string, unknown>, other: Record<string, unknown>) => key === "links"
        ? `${String(side[field] ?? 0)} links` : welcomeValue(key, side[field], other[field]);
      return { label: WELCOME_LABELS[key] ?? readableId(key), before: value(before, after), after: value(after, before) };
    });
  } catch { return null; }
}

const CEREMONY_LABELS: Record<string, string> = {
  enabled: "Achievement ceremonies", channel_id: "Destination channel", stories: "Story odds", mention_member: "Mention member",
};

function ceremonyValue(key: string, value: unknown, other: unknown): string {
  if (key === "mention_member") return welcomeValue(key, value, other);
  if (value === undefined || value === null) return "Not set";
  switch (key) {
    case "enabled": return value === true ? "On" : "Off";
    // Story rows share the welcome odds shape, so only differing rows are listed.
    case "stories": return welcomeValue("variants", value, other);
    default: return typeof value === "string" ? value : JSON.stringify(value);
  }
}

/** Readable achievement ceremony settings changes from the Rust audit snapshot. The raw detail stays available. */
export function ceremonyAuditChanges(entry: Pick<AuditEntry, "source" | "detail" | "action">): AuditChange[] | null {
  if (entry.source !== "discord" || !entry.detail || !entry.action.endsWith("ceremony.settings.save")) return null;
  try {
    const change = object(JSON.parse(entry.detail));
    if (!change || !Array.isArray(change.changed)) return null;
    const before = object(change.before) ?? {};
    const after = object(change.after) ?? {};
    return change.changed.filter((key): key is string => typeof key === "string").map((key) => ({
      label: CEREMONY_LABELS[key] ?? readableId(key),
      before: ceremonyValue(key, before[key], after[key]),
      after: ceremonyValue(key, after[key], before[key]),
    }));
  } catch { return null; }
}

/** The readable settings summary for any audited Discord settings save, or null. */
export function settingsAuditChanges(entry: Pick<AuditEntry, "source" | "detail" | "action">): AuditChange[] | null {
  return welcomeAuditChanges(entry) ?? ceremonyAuditChanges(entry);
}
