import type { GuildEvent } from "#lib/events/types.js";
import { parseGuildEvent } from "#lib/events/validate.js";

export type EventPayload = { event: GuildEvent; published: boolean } | { error: string };

export function parseEventPayload(form: FormData): EventPayload {
  const raw = form.get("payload");
  if (typeof raw !== "string" || raw.length > 65536) return { error: "Malformed submission." };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "Malformed submission." };
  }
  if (typeof json !== "object" || json === null) return { error: "Malformed submission." };
  const record = json as { event?: unknown; published?: unknown };
  const parsed = parseGuildEvent(record.event);
  if (!parsed.ok) return { error: parsed.error };
  return { event: parsed.event, published: record.published === true };
}
