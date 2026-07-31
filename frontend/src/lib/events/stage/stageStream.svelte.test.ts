import { afterEach, describe, expect, it, vi } from "vitest";

import type { StageMessage, StageRoll } from "$lib/events/stageProtocol";

vi.mock("$app/navigation", () => ({ invalidateAll: vi.fn() }));

import { StageFeed } from "./stageStream.svelte";

class FakeEventSource {
  static current: FakeEventSource;

  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.current = this;
  }

  close() {}

  emit(message: StageMessage) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
}

function stageRoll(overrides: Partial<StageRoll> = {}): StageRoll {
  const winner = { player_uuid: "winner", username: "Winner", tickets: 1 };
  return {
    rollId: "roll-1",
    raffleId: "raffle-1",
    slot: 0,
    prize: "Prize",
    entrants: [winner],
    winnerIndex: 0,
    winner,
    spin: { turns: 4, durationMs: 1_000 },
    state: "spinning",
    startedAt: 8_500,
    settlesAt: 9_500,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("StageFeed server clock", () => {
  it("settles against server time when the viewer clock is ahead", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    vi.stubGlobal("EventSource", FakeEventSource);
    const feed = new StageFeed("summer-raffle");
    feed.connect();

    FakeEventSource.current.emit({ type: "snapshot", now: 9_000, rolls: [stageRoll()] });

    expect(feed.clockOffset).toBe(1_000);
    await vi.advanceTimersByTimeAsync(499);
    expect(feed.rolls["raffle-1:0"]?.state).toBe("spinning");
    await vi.advanceTimersByTimeAsync(1);
    expect(feed.rolls["raffle-1:0"]?.state).toBe("settled");
    feed.close();
  });

  it("refreshes the offset and schedules from each roll message", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    vi.stubGlobal("EventSource", FakeEventSource);
    const feed = new StageFeed("summer-raffle");
    feed.connect();
    FakeEventSource.current.emit({ type: "snapshot", now: 9_000, rolls: [] });

    vi.setSystemTime(10_200);
    FakeEventSource.current.emit({
      type: "roll",
      now: 9_800,
      roll: stageRoll({ startedAt: 9_000, settlesAt: 10_000 }),
    });

    expect(feed.clockOffset).toBe(400);
    FakeEventSource.current.emit({
      type: "settled",
      rollId: "roll-1",
      raffleId: "raffle-1",
      slot: 0,
    });
    await vi.advanceTimersByTimeAsync(199);
    expect(feed.rolls["raffle-1:0"]?.state).toBe("spinning");
    await vi.advanceTimersByTimeAsync(1);
    expect(feed.rolls["raffle-1:0"]?.state).toBe("settled");
    feed.close();
  });
});
