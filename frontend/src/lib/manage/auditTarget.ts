import type { AuditEntry } from "$lib/server/auditLog";

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
