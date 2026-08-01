import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "$env/dynamic/private";
import { createClient, type Client } from "@libsql/client";

let dbPromise: Promise<Client> | undefined;
let dbClient: Client | undefined;

/**
 * Shared libsql client for all server-side storage. Each consumer owns its
 * tables: run CREATE TABLE IF NOT EXISTS once behind a module-level memo.
 */
export function database(): Promise<Client> {
  dbPromise ??= createDatabase().catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

/** Flushes and releases the local database before the process exits. */
export function closeDatabase(): void {
  dbPromise = undefined;
  dbClient?.close();
  dbClient = undefined;
}

async function createDatabase(): Promise<Client> {
  const url = databaseUrl();
  const localPath = localDatabasePath(url);
  if (localPath) await mkdir(path.dirname(localPath), { recursive: true });

  dbClient = createClient({
    url,
    authToken: env.TURSO_AUTH_TOKEN?.trim() || undefined,
    timeout: 5000,
  });
  return dbClient;
}

function databaseUrl(): string {
  return env.TURSO_DATABASE_URL?.trim() || env.SEQUOIA_WEB_DB_URL?.trim() || "file:.data/sequoia-web.db";
}

function localDatabasePath(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  const value = url.slice("file:".length);
  if (value.startsWith("//")) return fileURLToPath(url);
  return path.resolve(process.cwd(), value || ".data/sequoia-web.db");
}
