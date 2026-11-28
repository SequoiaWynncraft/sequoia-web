import type { Client } from "@libsql/client";

import type { Viewer } from "#lib/site/viewer.js";

import { database } from "./db";
import { discordManagement } from "./discordManagement";

export interface AuditEntry {
  id: number | string;
  source?: "website" | "discord";
  at: number;
  actor: string;
  actorDiscordId: string;
  actorMinecraftUuid: string;
  action: string;
  subject: string;
  detail: string | null;
}

const LIST_LIMIT = 200;

export interface AuditLog {
  record(viewer: Viewer, action: string, subject: string, detail?: string): Promise<boolean>;
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
const listAudit = auditLog.list;

export async function listManagementAudit(fetchImpl: typeof fetch, token: string | undefined): Promise<AuditEntry[]> {
  const [website, response] = await Promise.all([listAudit(), discordManagement(fetchImpl, token, "audit")]);
  if (!response.ok) throw new Error("Discord audit log unavailable");
  const discord: unknown = await response.json();
  if (!Array.isArray(discord) || !discord.every(isDiscordAuditEntry)) throw new Error("Invalid Discord audit response");
  return mergeAuditEntries(website, discord);
}

function isDiscordAuditEntry(entry: unknown): entry is AuditEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return typeof e.id === "string" && /^discord:\d+$/.test(e.id) && e.source === "discord"
    && typeof e.at === "number" && Number.isSafeInteger(e.at) && Number.isFinite(new Date(e.at).getTime())
    && [e.actor, e.actorDiscordId, e.actorMinecraftUuid, e.action, e.subject].every((v) => typeof v === "string")
    && (e.detail === null || typeof e.detail === "string");
}

export function mergeAuditEntries(website: AuditEntry[], discord: AuditEntry[]): AuditEntry[] {
  return [...website.map((entry): AuditEntry => ({ ...entry, id: `website:${entry.id}`, source: "website" })), ...discord]
    .sort((a, b) => {
      if (a.at !== b.at) return b.at - a.at;
      if (a.source !== b.source) return (a.source ?? "website").localeCompare(b.source ?? "website");
      const left = BigInt(String(a.id).split(":").at(-1)!);
      const right = BigInt(String(b.id).split(":").at(-1)!);
      return left === right ? 0 : left > right ? -1 : 1;
    }).slice(0, LIST_LIMIT);
}
