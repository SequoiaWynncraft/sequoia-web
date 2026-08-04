import { describe, expect, it } from "vitest";

import {
  elapsedLabel,
  entriesAhead,
  queueStanding,
  requestedAgoLabel,
  type RewardQueueEntry,
} from "$lib/rewardQueue";

/** A queue entry with only the fields under test spelled out. */
function entry(id: number, isViewer = false): RewardQueueEntry {
  return {
    requestId: id,
    minecraftUsername: `Player${id}`,
    guildRank: null,
    createdAtMs: 0,
    isViewer,
  };
}

/** A three-deep queue with the viewer at `position`, or nowhere in it when omitted. */
function queueWithViewerAt(position?: number): RewardQueueEntry[] {
  return [1, 2, 3].map((id) => entry(id, id === position));
}

const NO_VIEWER = queueWithViewerAt();

describe("queueStanding", () => {
  it("reports a 1-based position and the queue length", () => {
    const queue = queueWithViewerAt(2);
    expect(queueStanding(queue)).toEqual({ position: 2, total: 3, entry: queue[1] });
  });

  it("reports the front of the queue as position 1", () => {
    expect(queueStanding(queueWithViewerAt(1))?.position).toBe(1);
  });

  it("returns null for a member with no pending request", () => {
    expect(queueStanding(NO_VIEWER)).toBeNull();
    expect(queueStanding([])).toBeNull();
  });

  it("finds the viewer's row by its flag, not by name, so an in-game rename keeps the place", () => {
    const renamed = [{ ...entry(7, true), minecraftUsername: "BrandNewName" }];
    expect(queueStanding(renamed)?.position).toBe(1);
  });
});

describe("entriesAhead", () => {
  it("returns only the entries in front of the member", () => {
    expect(entriesAhead(queueWithViewerAt(3)).map((e) => e.requestId)).toEqual([1, 2]);
  });

  it("returns nothing when the member is at the front", () => {
    expect(entriesAhead(queueWithViewerAt(1))).toEqual([]);
  });

  it("returns the whole queue for a member who isn't in it", () => {
    expect(entriesAhead(NO_VIEWER).map((e) => e.requestId)).toEqual([1, 2, 3]);
  });
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("elapsedLabel", () => {
  it("reads 'just now' under a minute", () => {
    expect(elapsedLabel(1000, 1000)).toBe("just now");
    expect(elapsedLabel(0, 59_000)).toBe("just now");
  });

  it("reads 'just now' rather than a negative for a clock skewed forward", () => {
    expect(elapsedLabel(10 * MIN, 0)).toBe("just now");
  });

  it("uses minutes under an hour", () => {
    expect(elapsedLabel(0, 18 * MIN)).toBe("18min");
  });

  it("pairs hours with minutes, and drops the minutes when they are zero", () => {
    expect(elapsedLabel(0, 3 * HOUR + 5 * MIN)).toBe("3h 5min");
    expect(elapsedLabel(0, 3 * HOUR)).toBe("3h");
  });

  it("stops at two units past a day, so minutes never show", () => {
    expect(elapsedLabel(0, 2 * DAY + 4 * HOUR + 30 * MIN)).toBe("2d 4h");
    expect(elapsedLabel(0, 2 * DAY)).toBe("2d");
  });
});

describe("requestedAgoLabel", () => {
  it("marks the figure as elapsed, so it can't be read as time remaining", () => {
    expect(requestedAgoLabel(0, 3 * HOUR + 5 * MIN)).toBe("3h 5min ago");
    expect(requestedAgoLabel(0, 2 * DAY)).toBe("2d ago");
  });

  it("leaves 'just now' alone rather than making it 'just now ago'", () => {
    expect(requestedAgoLabel(0, 30_000)).toBe("just now");
  });
});
