import { fail } from "@sveltejs/kit";
import type { Client } from "@libsql/client";
import type { Cookies } from "@sveltejs/kit";

import { recordAudit } from "./auditLog";
import { database } from "./db";
import { requireEventManager } from "./eventManagers";

/**
 * Named editor presets: the raw draft payload the form builds, stored
 * verbatim. A preset is a starting point, not a publishable event - it is
 * only ever rendered back into the editor, which validates before saving.
 */
export interface EventPreset {
  name: string;
  /** The form's draft event object, JSON-encoded. */
  payload: string;
  updatedAt: number;
}

const MAX_NAME = 60;
const MAX_PAYLOAD = 65536;
const MAX_PRESETS = 100;

let dbPromise: Promise<Client> | undefined;

export async function listPresets(): Promise<EventPreset[]> {
  const db = await presetDb();
  const result = await db.execute(
    "SELECT name, payload, updated_at FROM guild_event_presets ORDER BY name ASC",
  );
  return result.rows.flatMap((row): EventPreset[] => {
    if (typeof row.name !== "string" || typeof row.payload !== "string" || typeof row.updated_at !== "number") {
      return [];
    }
    return [{ name: row.name, payload: row.payload, updatedAt: row.updated_at }];
  });
}

type ManageRequest = { request: Request; cookies: Cookies; fetch: typeof fetch };

/** Shared ?/savePreset form action: upserts a named preset. */
export async function savePresetAction(event: ManageRequest) {
  const manager = await requireEventManager(event);
  const form = await event.request.formData();
  const name = presetName(form.get("presetName"));
  if (!name) return fail(400, { presetError: "the preset needs a name (max 60 characters)" });
  const payload = form.get("presetPayload");
  if (typeof payload !== "string" || payload.length === 0 || payload.length > MAX_PAYLOAD) {
    return fail(400, { presetError: "Malformed submission." });
  }
  try {
    JSON.parse(payload);
  } catch {
    return fail(400, { presetError: "Malformed submission." });
  }
  const db = await presetDb();
  const count = await db.execute("SELECT COUNT(*) AS n FROM guild_event_presets");
  const existing = await db.execute({
    sql: "SELECT 1 FROM guild_event_presets WHERE name = ?",
    args: [name],
  });
  if (existing.rows.length === 0 && Number(count.rows[0]?.n ?? 0) >= MAX_PRESETS) {
    return fail(400, { presetError: `at most ${MAX_PRESETS} presets - delete one first` });
  }
  await db.execute({
    sql: "INSERT OR REPLACE INTO guild_event_presets (name, payload, created_by, updated_at) VALUES (?, ?, ?, ?)",
    args: [name, payload, manager.discordId, Date.now()],
  });
  const audited = await recordAudit(manager, "preset.save", name);
  return { presetSaved: name, auditWarning: !audited };
}

/** Shared ?/deletePreset form action. */
export async function deletePresetAction(event: ManageRequest) {
  const manager = await requireEventManager(event);
  const name = presetName((await event.request.formData()).get("presetName"));
  if (!name) return fail(400, { presetError: "Malformed submission." });
  const db = await presetDb();
  const result = await db.execute({ sql: "DELETE FROM guild_event_presets WHERE name = ?", args: [name] });
  // A stale double-delete removes nothing and must not mint an audit row.
  const audited = result.rowsAffected > 0 ? await recordAudit(manager, "preset.delete", name) : true;
  return { presetDeleted: name, auditWarning: !audited };
}

function presetName(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= MAX_NAME ? name : null;
}

function presetDb(): Promise<Client> {
  dbPromise ??= initPresetDb().catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

async function initPresetDb(): Promise<Client> {
  const db = await database();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS guild_event_presets (
      name TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  return db;
}
