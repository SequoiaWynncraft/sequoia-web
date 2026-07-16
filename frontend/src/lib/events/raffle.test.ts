import { describe, expect, it } from "vitest";

import { drawWinners, type RaffleEntrant } from "$lib/events/raffle";

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

  it("does not mutate the caller's pool", () => {
    const snapshot = JSON.parse(JSON.stringify(POOL));
    drawWinners(POOL, 2, { rng: sequenceRng([0, 0]) });
    expect(POOL).toEqual(snapshot);
  });
});
