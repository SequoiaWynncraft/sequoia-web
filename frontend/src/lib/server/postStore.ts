import type { Client, Row } from "@libsql/client";

import type { GuildPost } from "#lib/posts/types.js";
import { parseGuildPost } from "#lib/posts/validate.js";

import { database } from "./db";

export interface StoredPost {
  post: GuildPost;
  published: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PostStore {
  list(): Promise<StoredPost[]>;
  get(slug: string): Promise<StoredPost | null>;
  insert(post: GuildPost, options: { published: boolean }): Promise<boolean>;
  update(post: GuildPost, options: { published: boolean; ifUpdatedAt?: number }): Promise<number | null>;
  remove(slug: string, options?: { ifUpdatedAt?: number }): Promise<boolean>;
}

export function createPostStore(getClient: () => Promise<Client>): PostStore {
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
      CREATE TABLE IF NOT EXISTS guild_posts (
        slug TEXT PRIMARY KEY,
        feed TEXT NOT NULL,
        data TEXT NOT NULL,
        published INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    return db;
  }

  return {
    async list() {
      const db = await ready();
      const result = await db.execute(
        "SELECT data, published, created_at, updated_at FROM guild_posts ORDER BY created_at DESC, rowid DESC",
      );
      return result.rows.map(rowToStored).filter((row) => row !== null);
    },

    async get(slug) {
      const db = await ready();
      const result = await db.execute({
        sql: "SELECT data, published, created_at, updated_at FROM guild_posts WHERE slug = ?",
        args: [slug],
      });
      const row = result.rows[0];
      return row ? rowToStored(row) : null;
    },

    async insert(post, options) {
      const db = await ready();
      const now = Date.now();
      const result = await db.execute({
        sql: `
          INSERT INTO guild_posts (slug, feed, data, published, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (slug) DO NOTHING
        `,
        args: [post.slug, post.feed, JSON.stringify(post), options.published ? 1 : 0, now, now],
      });
      return result.rowsAffected > 0;
    },

    async update(post, options) {
      const db = await ready();
      const guarded = options.ifUpdatedAt !== undefined;
      const sql = guarded
        ? "UPDATE guild_posts SET feed = ?, data = ?, published = ?, updated_at = ? WHERE slug = ? AND updated_at = ?"
        : "UPDATE guild_posts SET feed = ?, data = ?, published = ?, updated_at = ? WHERE slug = ?";
      const now = guarded ? Math.max(Date.now(), (options.ifUpdatedAt as number) + 1) : Date.now();
      const args: (string | number)[] = [post.feed, JSON.stringify(post), options.published ? 1 : 0, now, post.slug];
      if (guarded) args.push(options.ifUpdatedAt as number);
      const result = await db.execute({ sql, args });
      return result.rowsAffected > 0 ? now : null;
    },

    async remove(slug, options = {}) {
      const db = await ready();
      const guarded = options.ifUpdatedAt !== undefined;
      const result = await db.execute({
        sql: guarded
          ? "DELETE FROM guild_posts WHERE slug = ? AND updated_at = ?"
          : "DELETE FROM guild_posts WHERE slug = ?",
        args: guarded ? [slug, options.ifUpdatedAt as number] : [slug],
      });
      return result.rowsAffected > 0;
    },
  };
}

function rowToStored(row: Row): StoredPost | null {
  if (typeof row.data !== "string") return null;
  let json: unknown;
  try {
    json = JSON.parse(row.data);
  } catch {
    return null;
  }
  const parsed = parseGuildPost(json);
  if (!parsed.ok) return null;
  return {
    post: parsed.post,
    published: Number(row.published) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export const postStore = createPostStore(database);
