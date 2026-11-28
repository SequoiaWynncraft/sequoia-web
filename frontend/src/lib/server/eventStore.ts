import type { Client, Row } from "@libsql/client";

import type { GuildEvent } from "#lib/events/types.js";
import { parseGuildEvent } from "#lib/events/validate.js";

import { database } from "./db";

export interface StoredEvent {
  event: GuildEvent;
  published: boolean;
  updatedAt: number;
}

export interface EventStore {
  list(): Promise<StoredEvent[]>;
  listPublished(): Promise<GuildEvent[]>;
  get(slug: string): Promise<StoredEvent | null>;
  insert(event: GuildEvent, options: { published: boolean }): Promise<boolean>;
  update(
    event: GuildEvent,
    options: { published: boolean; ifUpdatedAt?: number },
  ): Promise<number | null>;
  remove(slug: string, options?: { ifUpdatedAt?: number }): Promise<boolean>;
}

export function createEventStore(getClient: () => Promise<Client>): EventStore {
  let readyPromise: Promise<Client> | undefined;

  function ready(): Promise<Client> {
    readyPromise ??= init().catch((error: unknown) => {
      readyPromise = undefined;
      throw error;
    });
    return readyPromise;
  }

  async function init(): Promise<Client> {
    const db = await getClient();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS guild_events (
        slug TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        published INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    return db;
  }

  return {
    async list() {
      const db = await ready();
      const result = await db.execute("SELECT data, published, updated_at FROM guild_events ORDER BY created_at DESC");
      return result.rows.map(rowToStored).filter((row) => row !== null);
    },

    async listPublished() {
      const db = await ready();
      const result = await db.execute(
        "SELECT data, published, updated_at FROM guild_events WHERE published = 1 ORDER BY created_at DESC",
      );
      return result.rows
        .map(rowToStored)
        .filter((row) => row !== null)
        .map((row) => row.event);
    },

    async get(slug) {
      const db = await ready();
      const result = await db.execute({
        sql: "SELECT data, published, updated_at FROM guild_events WHERE slug = ?",
        args: [slug],
      });
      const row = result.rows[0];
      return row ? rowToStored(row) : null;
    },

    async insert(event, options) {
      const db = await ready();
      const now = Date.now();
      const result = await db.execute({
        sql: `
          INSERT INTO guild_events (slug, data, published, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (slug) DO NOTHING
        `,
        args: [event.slug, JSON.stringify(event), options.published ? 1 : 0, now, now],
      });
      return result.rowsAffected > 0;
    },

    async update(event, options) {
      const db = await ready();
      const sql =
        options.ifUpdatedAt === undefined
          ? "UPDATE guild_events SET data = ?, published = ?, updated_at = ? WHERE slug = ?"
          : "UPDATE guild_events SET data = ?, published = ?, updated_at = ? WHERE slug = ? AND updated_at = ?";
      const now =
        options.ifUpdatedAt === undefined ? Date.now() : Math.max(Date.now(), options.ifUpdatedAt + 1);
      const args = [JSON.stringify(event), options.published ? 1 : 0, now, event.slug];
      if (options.ifUpdatedAt !== undefined) args.push(options.ifUpdatedAt);
      const result = await db.execute({ sql, args });
      return result.rowsAffected > 0 ? now : null;
    },

    async remove(slug, options = {}) {
      const db = await ready();
      const sql =
        options.ifUpdatedAt === undefined
          ? "DELETE FROM guild_events WHERE slug = ?"
          : "DELETE FROM guild_events WHERE slug = ? AND updated_at = ?";
      const args: (string | number)[] = [slug];
      if (options.ifUpdatedAt !== undefined) args.push(options.ifUpdatedAt);
      const result = await db.execute({ sql, args });
      return result.rowsAffected > 0;
    },
  };
}

function rowToStored(row: Row): StoredEvent | null {
  if (typeof row.data !== "string") return null;
  let json: unknown;
  try {
    json = JSON.parse(row.data);
  } catch {
    return null;
  }
  const parsed = parseGuildEvent(json);
  if (!parsed.ok) return null;
  return { event: parsed.event, published: Number(row.published) === 1, updatedAt: Number(row.updated_at) };
}

export const eventStore = createEventStore(database);
