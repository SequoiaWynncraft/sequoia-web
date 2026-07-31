import { describe, expect, it } from "vitest";

import {
  dayGap,
  isGuildLevelHistoryResponse,
  toLevelUps,
  type GuildLevelHistoryEntry,
} from "$lib/api/guildLevel";

/** The live payload shape, as the backend sends it. */
const RESPONSE = {
  guild_uuid: "ee860b7c-9a1d-49cf-9f19-ab673ba0f23b",
  name: "Sequoia",
  prefix: "SEQ",
  current_level: 245,
  level_observed_at: "2026-07-30T11:08:51.822744Z",
  entries: [{ level: 245, observed_at: "2026-07-29T15:59:15.913142Z" }],
};

describe("isGuildLevelHistoryResponse", () => {
  it("accepts the payload the backend sends", () => {
    expect(isGuildLevelHistoryResponse(RESPONSE)).toBe(true);
  });

  it("accepts a guild the backend has recorded no level change for", () => {
    expect(isGuildLevelHistoryResponse({ ...RESPONSE, entries: [] })).toBe(true);
  });

  it("rejects values that are not the response", () => {
    expect(isGuildLevelHistoryResponse(null)).toBe(false);
    expect(isGuildLevelHistoryResponse("245")).toBe(false);
    const { entries: _entries, ...withoutEntries } = RESPONSE;
    expect(isGuildLevelHistoryResponse(withoutEntries)).toBe(false);
    expect(isGuildLevelHistoryResponse({ ...RESPONSE, entries: {} })).toBe(false);
    expect(isGuildLevelHistoryResponse({ ...RESPONSE, current_level: "245" })).toBe(false);
  });

  it("rejects a response whose entries are not level observations", () => {
    expect(
      isGuildLevelHistoryResponse({ ...RESPONSE, entries: [{ level: "245", observed_at: "x" }] }),
    ).toBe(false);
    expect(isGuildLevelHistoryResponse({ ...RESPONSE, entries: [{ level: 245 }] })).toBe(false);
  });
});

describe("toLevelUps", () => {
  it("returns the level-ups newest first with the previous level derived", () => {
    const history = toLevelUps([
      { level: 244, observed_at: "2026-07-26T17:45:23.605Z" },
      { level: 245, observed_at: "2026-07-29T15:59:15.913Z" },
      { level: 246, observed_at: "2026-08-01T09:00:00.000Z" },
    ]);

    expect(history).toEqual([
      { level: 246, fromLevel: 245, reachedAt: "2026-08-01T09:00:00.000Z" },
      { level: 245, fromLevel: 244, reachedAt: "2026-07-29T15:59:15.913Z" },
      // The oldest row has no predecessor on record to have come from.
      { level: 244, fromLevel: null, reachedAt: "2026-07-26T17:45:23.605Z" },
    ]);
  });

  it("leaves the only row of a one-entry history without a previous level", () => {
    expect(toLevelUps(RESPONSE.entries)).toEqual([
      { level: 245, fromLevel: null, reachedAt: "2026-07-29T15:59:15.913Z" },
    ]);
  });

  it("orders by observation rather than trusting the order it is given", () => {
    const history = toLevelUps([
      { level: 246, observed_at: "2026-08-01T09:00:00.000Z" },
      { level: 244, observed_at: "2026-07-26T17:45:23.605Z" },
      { level: 245, observed_at: "2026-07-29T15:59:15.913Z" },
    ]);

    expect(history.map((entry) => entry.level)).toEqual([246, 245, 244]);
    expect(history.map((entry) => entry.fromLevel)).toEqual([245, 244, null]);
  });

  it("drops entries it cannot trust", () => {
    const entries = [
      { level: 244, observed_at: "2026-07-26T17:45:23.605Z" },
      { level: 245.5, observed_at: "2026-07-27T00:00:00.000Z" },
      { level: 0, observed_at: "2026-07-28T00:00:00.000Z" },
      { level: 246, observed_at: "not a date" },
    ] as GuildLevelHistoryEntry[];

    expect(toLevelUps(entries)).toEqual([
      { level: 244, fromLevel: null, reachedAt: "2026-07-26T17:45:23.605Z" },
    ]);
  });

  it("keeps only the first of a repeated or falling level", () => {
    const history = toLevelUps([
      { level: 244, observed_at: "2026-07-26T17:45:23.605Z" },
      { level: 244, observed_at: "2026-07-27T00:00:00.000Z" },
      { level: 200, observed_at: "2026-07-28T00:00:00.000Z" },
      { level: 245, observed_at: "2026-07-29T15:59:15.913Z" },
    ]);

    expect(history.map((entry) => entry.level)).toEqual([245, 244]);
    expect(history[0]?.fromLevel).toBe(244);
  });

  it("has nothing to show for an empty history", () => {
    expect(toLevelUps([])).toEqual([]);
  });
});

describe("dayGap", () => {
  it("measures the gap in days to four decimals", () => {
    expect(dayGap("2026-07-26T17:45:23.605Z", "2026-07-29T01:45:24.811Z")).toBe("2.3333");
  });
});
