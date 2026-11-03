import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient, type Client } from "@libsql/client";

/**
 * Real libSQL files in a temporary directory, for storage tests. Each
 * `connect` opens an independent connection to the named file. WAL with
 * synchronous=OFF only skips fsyncs; every write still runs in a real SQLite
 * transaction, and production connections keep their defaults.
 */
export async function disposableDatabase() {
  const dir = await mkdtemp(path.join(tmpdir(), "sequoia-test-db-"));
  const clients: Client[] = [];
  return {
    file: (name: string) => path.join(dir, name),
    async connect(name = "test.db"): Promise<Client> {
      const client = createClient({ url: `file:${path.join(dir, name)}`, timeout: 5000 });
      await client.execute("PRAGMA journal_mode = WAL");
      await client.execute("PRAGMA synchronous = OFF");
      clients.push(client);
      return client;
    },
    async dispose(): Promise<void> {
      for (const client of clients.splice(0)) client.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
