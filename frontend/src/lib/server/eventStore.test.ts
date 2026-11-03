import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

import type { GuildEvent } from "#lib/events/types.js";

import { createEventStore } from "./eventStore";

function memoryStore() {
  const client = createClient({ url: ":memory:" });
  return { client, store: createEventStore(() => Promise.resolve(client)) };
}

const DRAFT: GuildEvent = {
  slug: "draft-event",
  name: "Draft Event",
  tagline: "Not ready yet.",
  access: "public",
  theme: {
    sky: ["#000000", "#111111"],
    accent: "#ffffff",
    accentSecondary: "#eeeeee",
    star: "#dddddd",
  },
};

describe("event store", () => {
  it("starts a fresh database with no events", async () => {
    const { store } = memoryStore();
    expect(await store.list()).toEqual([]);
  });

  it("keeps the events an existing database already holds", async () => {
    const client = createClient({ url: ":memory:" });
    await client.execute(
      "CREATE TABLE guild_events (slug TEXT PRIMARY KEY, data TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    );
    await client.execute("CREATE TABLE guild_events_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    await client.execute("INSERT INTO guild_events_meta (key, value) VALUES ('seeded', '1')");
    await client.execute({
      sql: "INSERT INTO guild_events (slug, data, published, created_at, updated_at) VALUES (?, ?, 1, 1, 1)",
      args: [DRAFT.slug, JSON.stringify(DRAFT)],
    });

    const store = createEventStore(() => Promise.resolve(client));
    expect(await store.listPublished()).toEqual([DRAFT]);
    expect((await client.execute("SELECT value FROM guild_events_meta")).rows).toHaveLength(1);
  });

  it("round-trips writes and hides drafts from the published list", async () => {
    const { store } = memoryStore();
    expect(await store.insert(DRAFT, { published: false })).toBe(true);

    const stored = await store.get("draft-event");
    expect(stored?.event.name).toBe("Draft Event");
    expect(stored?.published).toBe(false);

    const published = await store.listPublished();
    expect(published.map((event) => event.slug)).not.toContain("draft-event");
    expect((await store.list()).map((entry) => entry.event.slug)).toContain("draft-event");

    expect(await store.update({ ...DRAFT, name: "Ready Event" }, { published: true })).not.toBeNull();
    const updated = await store.get("draft-event");
    expect(updated?.event.name).toBe("Ready Event");
    expect(updated?.published).toBe(true);
  });

  it("refuses conflicting inserts and updates of missing events", async () => {
    const { store } = memoryStore();
    expect(await store.insert(DRAFT, { published: false })).toBe(true);

    expect(await store.insert({ ...DRAFT, name: "Impostor" }, { published: true })).toBe(false);
    expect((await store.get("draft-event"))?.event.name).toBe("Draft Event");

    expect(await store.update({ ...DRAFT, slug: "never-created" }, { published: true })).toBeNull();
  });

  it("only deletes the version the caller reviewed", async () => {
    const { store } = memoryStore();
    expect(await store.insert(DRAFT, { published: true })).toBe(true);
    const first = await store.get("draft-event");
    expect(first).not.toBeNull();

    expect(
      await store.update({ ...DRAFT, name: "Improved" }, { published: true, ifUpdatedAt: first!.updatedAt }),
    ).not.toBeNull();
    expect(await store.remove("draft-event", { ifUpdatedAt: first!.updatedAt })).toBe(false);
    expect((await store.get("draft-event"))?.event.name).toBe("Improved");

    const current = await store.get("draft-event");
    expect(await store.remove("draft-event", { ifUpdatedAt: current!.updatedAt })).toBe(true);
    expect(await store.remove("draft-event", { ifUpdatedAt: current!.updatedAt })).toBe(false);
    expect(await store.get("draft-event")).toBeNull();
  });

});
