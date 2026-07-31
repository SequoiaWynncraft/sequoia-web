import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

import { createRaffleRollStore, toStageRoll, type RaffleRoll } from "./raffleRolls";

function memoryStore() {
  const client = createClient({ url: ":memory:" });
  return createRaffleRollStore(() => Promise.resolve(client));
}

let sequence = 0;

function roll(overrides: Partial<RaffleRoll> = {}): RaffleRoll {
  sequence += 1;
  const entrants = [
    { player_uuid: "uuid-a", username: "Alice", tickets: 3 },
    { player_uuid: "uuid-b", username: "Bob", tickets: 1 },
  ];
  return {
    rollId: `roll-${sequence}`,
    eventSlug: "test-event",
    raffleId: "r1",
    slot: 0,
    prize: "Mythic",
    entrants,
    winnerIndex: 0,
    winner: entrants[0],
    spin: { turns: 5, durationMs: 9000 },
    state: "spinning",
    superseded: false,
    pending: false,
    startedAt: Date.now() + sequence,
    settlesAt: Date.now() + 60_000,
    createdBy: "manager-1",
    ...overrides,
  };
}

describe("raffle roll store", () => {
  it("round-trips a roll with its entrant snapshot", async () => {
    const store = memoryStore();
    const inserted = roll();
    await store.insert(inserted);
    const [read] = await store.latestForEvent("test-event");
    expect(read).toEqual(inserted);
  });

  it("keeps only the latest roll per raffle:slot in the snapshot", async () => {
    const store = memoryStore();
    const first = roll({ startedAt: 1000, settlesAt: Date.now() + 60_000 });
    const second = roll({ startedAt: 2000, settlesAt: Date.now() + 60_000 });
    const otherSlot = roll({ slot: 1, startedAt: 1500, settlesAt: Date.now() + 60_000 });
    await store.insert(first);
    await store.insert(second);
    await store.insert(otherSlot);
    const latest = await store.latestForEvent("test-event");
    expect(latest.map((entry) => entry.rollId).sort()).toEqual(
      [second.rollId, otherSlot.rollId].sort(),
    );
  });

  it("supersedes prior rolls of a slot and drops them from the snapshot only", async () => {
    const store = memoryStore();
    const first = roll();
    await store.insert(first);
    await store.markSuperseded("test-event", "r1", 0);
    const second = roll();
    await store.insert(second);
    const latest = await store.latestForEvent("test-event");
    expect(latest.map((entry) => entry.rollId)).toEqual([second.rollId]);
    const history = await store.listForEvent("test-event");
    expect(history).toHaveLength(2);
    expect(history.find((entry) => entry.rollId === first.rollId)?.superseded).toBe(true);
  });

  it("settles a spinning roll, and reads past-settle rolls as settled anyway", async () => {
    const store = memoryStore();
    const live = roll();
    await store.insert(live);
    await store.markSettled(live.rollId);
    expect((await store.latestForEvent("test-event"))[0]?.state).toBe("settled");

    // A roll whose settle timer died with its process still reads settled
    // once the wall clock passes settlesAt.
    const orphan = roll({ slot: 1, startedAt: 10, settlesAt: Date.now() - 1000 });
    await store.insert(orphan);
    const read = (await store.latestForEvent("test-event")).find((entry) => entry.slot === 1);
    expect(read?.state).toBe("settled");
  });

  it("scopes reads to the event", async () => {
    const store = memoryStore();
    await store.insert(roll());
    await store.insert(roll({ eventSlug: "other-event", rollId: "other-roll" }));
    expect(await store.latestForEvent("other-event")).toHaveLength(1);
    expect(await store.listForEvent("test-event")).toHaveLength(1);
  });

  it("purges an event's rolls without touching other events", async () => {
    const store = memoryStore();
    await store.insert(roll());
    await store.insert(roll({ slot: 1 }));
    await store.insert(roll({ eventSlug: "other-event", rollId: "other-roll" }));
    await store.removeForEvent("test-event");
    expect(await store.listForEvent("test-event")).toHaveLength(0);
    expect(await store.latestForEvent("test-event")).toHaveLength(0);
    expect(await store.listForEvent("other-event")).toHaveLength(1);
  });
});

describe("wire projection", () => {
  it("strips persistence-only fields off the public shape", () => {
    const record = roll();
    const wire = toStageRoll(record);
    expect(wire).not.toHaveProperty("createdBy");
    expect(wire).not.toHaveProperty("eventSlug");
    expect(wire).not.toHaveProperty("superseded");
    expect(wire.rollId).toBe(record.rollId);
    expect(wire.entrants).toEqual(record.entrants);
    expect(wire.winnerIndex).toBe(record.winnerIndex);
  });
});

describe("targeted supersede", () => {
  it("retires exactly the observed roll, leaving a rival's fresh record alone", async () => {
    const store = memoryStore();
    const observed = roll();
    await store.insert(observed);
    const rival = roll();
    await store.insert(rival);
    await store.markSupersededById(observed.rollId);
    const latest = await store.latestForEvent("test-event");
    expect(latest.map((entry) => entry.rollId)).toEqual([rival.rollId]);
    const history = await store.listForEvent("test-event");
    expect(history.find((entry) => entry.rollId === observed.rollId)?.superseded).toBe(true);
    expect(history.find((entry) => entry.rollId === rival.rollId)?.superseded).toBe(false);
  });
});

describe("pending rolls", () => {
  it("keeps a live pending row visible and flips it live on markLive", async () => {
    const store = memoryStore();
    const record = roll({ pending: true });
    await store.insert(record);
    const [read] = await store.latestForEvent("test-event");
    expect(read.pending).toBe(true);
    await store.markLive(record.rollId);
    const [live] = await store.latestForEvent("test-event");
    expect(live.pending).toBe(false);
    expect(live.state).toBe("spinning");
  });

  it("an expired pending row is invisible and never shadows the slot's real roll", async () => {
    const store = memoryStore();
    const settled = roll({ startedAt: 1000, settlesAt: 2000 });
    await store.insert(settled);
    const abandoned = roll({ pending: true, startedAt: 3000, settlesAt: Date.now() - 1 });
    await store.insert(abandoned);
    const latest = await store.latestForEvent("test-event");
    expect(latest.map((entry) => entry.rollId)).toEqual([settled.rollId]);
  });

  it("markLive does not resurrect a superseded row", async () => {
    const store = memoryStore();
    const record = roll({ pending: true });
    await store.insert(record);
    await store.markSupersededById(record.rollId);
    await store.markLive(record.rollId);
    expect(await store.latestForEvent("test-event")).toHaveLength(0);
  });
});
