import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

import { SEED_EVENTS } from "$lib/events/seed";
import type { GuildEvent } from "$lib/events/types";

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
  it("seeds the code-defined events on first use", async () => {
    const { store } = memoryStore();
    const events = await store.listPublished();
    expect(events.map((event) => event.slug).sort()).toEqual(
      SEED_EVENTS.map((event) => event.slug).sort(),
    );
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

    expect(await store.update({ ...DRAFT, name: "Ready Event" }, { published: true })).toBe(true);
    const updated = await store.get("draft-event");
    expect(updated?.event.name).toBe("Ready Event");
    expect(updated?.published).toBe(true);
  });

  it("refuses conflicting inserts and updates of missing events", async () => {
    const { store } = memoryStore();
    expect(await store.insert(DRAFT, { published: false })).toBe(true);

    // A losing concurrent create must not overwrite the stored event.
    expect(await store.insert({ ...DRAFT, name: "Impostor" }, { published: true })).toBe(false);
    expect((await store.get("draft-event"))?.event.name).toBe("Draft Event");

    expect(await store.update({ ...DRAFT, slug: "never-created" }, { published: true })).toBe(false);
  });

  it("never resurrects deleted seed events", async () => {
    const { client, store } = memoryStore();
    expect(await store.remove("colossus-sprint")).toBe(true);
    expect(await store.remove("colossus-sprint")).toBe(false);

    // A fresh store over the same database must respect the seed marker.
    const reopened = createEventStore(() => Promise.resolve(client));
    expect(await reopened.get("colossus-sprint")).toBeNull();
  });
});
