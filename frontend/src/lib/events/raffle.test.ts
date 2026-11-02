import { describe, expect, it } from "vitest";

import { drawWinners, type RaffleEntrant } from "#lib/events/raffle.js";

const POOL: RaffleEntrant[] = [
  { player_uuid: "a", username: "Alice", tickets: 3 },
  { player_uuid: "b", username: "Bob", tickets: 1 },
  { player_uuid: "c", username: "Cara", tickets: 6 },
];

/** Feeds a fixed sequence of [0, 1) values so each draw is deterministic. */
function sequenceRng(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe("drawWinners", () => {
  it("picks by weighted position within the running ticket total", () => {
    // Total 10; threshold 0 lands on the first entrant (Alice, 3 tickets).
    const first = drawWinners(POOL, 1, { rng: sequenceRng([0]) });
    expect(first).toEqual([{ username: "Alice", player_uuid: "a", tickets: 3 }]);

    // Threshold 0.35 * 10 = 3.5: past Alice's 3, into Bob's slot.
    const second = drawWinners(POOL, 1, { rng: sequenceRng([0.35]) });
    expect(second[0].username).toBe("Bob");

    // Threshold near the top lands on the last entrant (Cara).
    const third = drawWinners(POOL, 1, { rng: sequenceRng([0.99]) });
    expect(third[0].username).toBe("Cara");
  });

  it("draws distinct winners without replacement", () => {
    const winners = drawWinners(POOL, 3, { rng: sequenceRng([0, 0, 0]) });
    expect(winners.length).toBe(3);
    expect(new Set(winners.map((w) => w.player_uuid)).size).toBe(3);
  });

  it("returns at most the eligible pool size", () => {
    const winners = drawWinners(POOL, 10, { rng: sequenceRng([0.5]) });
    expect(winners.length).toBe(3);
  });

  it("drops zero-ticket entrants and excluded uuids", () => {
    const pool: RaffleEntrant[] = [
      { player_uuid: "a", username: "Alice", tickets: 5 },
      { player_uuid: "b", username: "Bob", tickets: 0 },
      { player_uuid: "c", username: "Cara", tickets: 5 },
    ];
    const winners = drawWinners(pool, 5, { exclude: ["c"], rng: sequenceRng([0.5]) });
    expect(winners).toEqual([{ username: "Alice", player_uuid: "a", tickets: 5 }]);
  });

  it("excludes UUID spelling variants without changing the stored entrant UUID", () => {
    const pool: RaffleEntrant[] = [
      {
        player_uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        username: "Alice",
        tickets: 5,
      },
      {
        player_uuid: "11111111-2222-3333-4444-555555555555",
        username: "Bob",
        tickets: 5,
      },
    ];
    const winners = drawWinners(pool, 2, {
      exclude: ["AAAAAAAABBBBCCCCDDDDEEEEEEEEEEEE"],
      rng: sequenceRng([0]),
    });
    expect(winners).toEqual([
      {
        username: "Bob",
        player_uuid: "11111111-2222-3333-4444-555555555555",
        tickets: 5,
      },
    ]);
  });

  it("collapses repeated uuids so a member wins at most one slot", () => {
    const pool: RaffleEntrant[] = [
      { player_uuid: "a", username: "Alice", tickets: 3 },
      { player_uuid: "a", username: "Alice", tickets: 3 },
      { player_uuid: "b", username: "Bob", tickets: 1 },
    ];
    const winners = drawWinners(pool, 5, { rng: sequenceRng([0, 0]) });
    expect(winners.filter((w) => w.player_uuid === "a").length).toBe(1);
    expect(new Set(winners.map((w) => w.player_uuid))).toEqual(new Set(["a", "b"]));
  });

  it("drains a full 150-member guild pool without truncating", () => {
    // Every guild member enters (>=1 ticket); the draw must handle the whole
    // roster - both a partial draw and one that empties the pool.
    const pool: RaffleEntrant[] = Array.from({ length: 150 }, (_, index) => ({
      player_uuid: `p${index}`,
      username: `Member${index}`,
      tickets: index + 1,
    }));
    const fifty = drawWinners(pool, 50, { rng: sequenceRng([0.5]) });
    expect(fifty.length).toBe(50);
    expect(new Set(fifty.map((w) => w.player_uuid)).size).toBe(50);

    const everyone = drawWinners(pool, 150, { rng: sequenceRng([0.5]) });
    expect(everyone.length).toBe(150);
    expect(new Set(everyone.map((w) => w.player_uuid)).size).toBe(150);
  });

  it("does not mutate the caller's pool", () => {
    const snapshot = JSON.parse(JSON.stringify(POOL));
    drawWinners(POOL, 2, { rng: sequenceRng([0, 0]) });
    expect(POOL).toEqual(snapshot);
  });
});

describe("uuid spelling tolerance", () => {
  it("excludes and dedupes across case and hyphen differences", () => {
    const pool: RaffleEntrant[] = [
      { player_uuid: "AA-BB-CC", username: "Alice", tickets: 3 },
      { player_uuid: "aabbcc", username: "Alice2", tickets: 2 },
      { player_uuid: "dd-ee", username: "Dana", tickets: 1 },
    ];
    // Exclusion spelled differently still bars the entrant; the duplicate
    // spelling of the same uuid never re-enters the pool.
    const barred = drawWinners(pool, 3, { exclude: ["aabbcc"], rng: () => 0 });
    expect(barred.map((winner) => winner.username)).toEqual(["Dana"]);
    const deduped = drawWinners(pool, 3, { rng: () => 0 });
    expect(deduped.map((winner) => winner.username)).toEqual(["Alice", "Dana"]);
  });
});
