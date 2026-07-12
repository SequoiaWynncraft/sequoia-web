import type { Client, Row } from "@libsql/client";

import { SEED_EVENTS } from "$lib/events/seed";
import type { GuildEvent } from "$lib/events/types";
import { parseGuildEvent } from "$lib/events/validate";

import { database } from "./db";

export interface StoredEvent {
  event: GuildEvent;
  /** Unpublished events are drafts: only visible on the manage pages. */
  published: boolean;
  updatedAt: number;
}

export interface EventStore {
  /** Every event, drafts included, newest first. */
  list(): Promise<StoredEvent[]>;
  listPublished(): Promise<GuildEvent[]>;
  get(slug: string): Promise<StoredEvent | null>;
  save(event: GuildEvent, options: { published: boolean }): Promise<void>;
  /** Returns false when no event had that slug. */
  remove(slug: string): Promise<boolean>;
}

/**
 * Events live as validated JSON rows so the schema can grow with GuildEvent
 * without migrations; parseGuildEvent guards both directions of the boundary.
 */
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
    await db.execute(`
      CREATE TABLE IF NOT EXISTS guild_events_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await seed(db);
    return db;
  }

  // The seed marker (not row count) decides whether to import, so deleting
  // every event later does not bring the seed back.
  async function seed(db: Client) {
    const marker = await db.execute("SELECT value FROM guild_events_meta WHERE key = 'seeded'");
    if (marker.rows.length > 0) return;
    const now = Date.now();
    for (const event of SEED_EVENTS) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO guild_events (slug, data, published, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
        args: [event.slug, JSON.stringify(event), now, now],
      });
    }
    await db.execute("INSERT OR REPLACE INTO guild_events_meta (key, value) VALUES ('seeded', '1')");
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

    async save(event, options) {
      const db = await ready();
      const now = Date.now();
      await db.execute({
        sql: `
          INSERT INTO guild_events (slug, data, published, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (slug) DO UPDATE SET
            data = excluded.data,
            published = excluded.published,
            updated_at = excluded.updated_at
        `,
        args: [event.slug, JSON.stringify(event), options.published ? 1 : 0, now, now],
      });
    },

    async remove(slug) {
      const db = await ready();
      const result = await db.execute({
        sql: "DELETE FROM guild_events WHERE slug = ?",
        args: [slug],
      });
      return result.rowsAffected > 0;
    },
  };
}

/** Rows that fail validation are dropped rather than crashing the page. */
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
