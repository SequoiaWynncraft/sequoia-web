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

export interface AuditLog {
  /**
   * Appends one row to the manager audit trail. Never throws - an audit
   * hiccup must not fail the action it describes - but returns false so the
   * caller can tell the manager the action went unrecorded.
   */
  record(viewer: Viewer, action: string, subject: string, detail?: string): Promise<boolean>;
  /**
   * Newest entries first. Failures throw: the caller must render the log as
   * unavailable, never as empty - "no activity" is a claim this module cannot
   * back when its storage is unhealthy.
   */
  list(limit?: number): Promise<AuditEntry[]>;
}

export function createAuditLog(getClient: () => Promise<Client>): AuditLog {
  let dbPromise: Promise<Client> | undefined;

  function auditDb(): Promise<Client> {
    dbPromise ??= initAuditDb().catch((error: unknown) => {
      dbPromise = undefined;
      throw error;
    });
    return dbPromise;
  }

  async function initAuditDb(): Promise<Client> {
    const db = await getClient();
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

  return {
    async record(viewer, action, subject, detail) {
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
        return true;
      } catch (error) {
        console.error(`audit log write failed (${action} ${subject}):`, error);
        return false;
      }
    },

    async list(limit = LIST_LIMIT) {
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
    },
  };
}

const auditLog = createAuditLog(database);

export const recordAudit = auditLog.record;
export const listAudit = auditLog.list;
