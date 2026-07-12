import type { Client } from "@libsql/client";

import type { Viewer } from "$lib/site/viewer";

import { database } from "./db";

export interface AuditEntry {
  id: number;
  /** Epoch milliseconds. */
  at: number;
  actor: string;
  actorDiscordId: string;
  /** Stable profile link target; empty when the session lacked one. */
  actorMinecraftUuid: string;
  action: string;
  subject: string;
  detail: string | null;
}

const LIST_LIMIT = 200;

let dbPromise: Promise<Client> | undefined;

/**
 * Appends one row to the manager audit trail. Failures are logged, never
 * thrown - an audit hiccup must not fail the action it describes.
 */
export async function recordAudit(
  viewer: Viewer,
  action: string,
  subject: string,
  detail?: string,
): Promise<void> {
  try {
    const db = await auditDb();
    await db.execute({
      sql: "INSERT INTO audit_log (at, actor, actor_discord_id, actor_minecraft_uuid, action, subject, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        Date.now(),
        viewer.minecraftUsername ?? viewer.discordUsername ?? viewer.discordId,
        viewer.discordId,
        viewer.minecraftUuid,
        action,
        subject,
        detail ?? null,
      ],
    });
  } catch (error) {
    console.warn("audit log write failed:", error);
  }
}

/** Newest entries first. */
export async function listAudit(limit = LIST_LIMIT): Promise<AuditEntry[]> {
  const db = await auditDb();
  const result = await db.execute({
    sql: "SELECT id, at, actor, actor_discord_id, actor_minecraft_uuid, action, subject, detail FROM audit_log ORDER BY id DESC LIMIT ?",
    args: [Math.max(0, Math.min(Math.trunc(limit), 1000))],
  });
  return result.rows.flatMap((row): AuditEntry[] => {
    if (
      typeof row.id !== "number" ||
      typeof row.at !== "number" ||
      typeof row.actor !== "string" ||
      typeof row.actor_discord_id !== "string" ||
      typeof row.action !== "string" ||
      typeof row.subject !== "string"
    ) {
      return [];
    }
    return [
      {
        id: row.id,
        at: row.at,
        actor: row.actor,
        actorDiscordId: row.actor_discord_id,
        actorMinecraftUuid: typeof row.actor_minecraft_uuid === "string" ? row.actor_minecraft_uuid : "",
        action: row.action,
        subject: row.subject,
        detail: typeof row.detail === "string" ? row.detail : null,
      },
    ];
  });
}

function auditDb(): Promise<Client> {
  dbPromise ??= initAuditDb().catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

async function initAuditDb(): Promise<Client> {
  const db = await database();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      actor TEXT NOT NULL,
      actor_discord_id TEXT NOT NULL,
      actor_minecraft_uuid TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      subject TEXT NOT NULL,
      detail TEXT
    )
  `);
  return db;
}
