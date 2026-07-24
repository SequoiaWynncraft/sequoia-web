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
  /** Atomic create - returns false when the slug is already taken. */
  insert(event: GuildEvent, options: { published: boolean }): Promise<boolean>;
  /**
   * Atomic update - returns false when no event has that slug. When
   * `ifUpdatedAt` is given, the write only lands if the row still carries that
   * `updatedAt`, so a concurrent read-modify-write (e.g. two raffle rolls)
   * loses instead of silently clobbering; the loser gets false.
   */
  update(event: GuildEvent, options: { published: boolean; ifUpdatedAt?: number }): Promise<boolean>;
  /**
   * Returns false when no event had that slug. When `ifUpdatedAt` is given,
   * the delete only lands if the row still carries that `updatedAt`, so a
   * stale tab cannot remove a version its manager never reviewed.
   */
  remove(slug: string, options?: { ifUpdatedAt?: number }): Promise<boolean>;
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
      // The guarded write must advance the token strictly: two rolls in the
      // same millisecond would otherwise write a token equal to the guard
      // value, letting a later CAS on the old value still match and clobber.
      const now =
        options.ifUpdatedAt === undefined ? Date.now() : Math.max(Date.now(), options.ifUpdatedAt + 1);
      const args = [JSON.stringify(event), options.published ? 1 : 0, now, event.slug];
      if (options.ifUpdatedAt !== undefined) args.push(options.ifUpdatedAt);
      const result = await db.execute({ sql, args });
      return result.rowsAffected > 0;
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
