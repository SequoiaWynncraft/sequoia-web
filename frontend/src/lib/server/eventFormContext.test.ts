import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { eventFormContext } from "./eventFormContext";
import { listPresets } from "./eventPresets";
import { getGuildStats } from "./guildStats";
import { loadRaidEvents } from "./raidEventBoards";
import { getLinkedRankProfiles, progressionRankLabels } from "./rankProfiles";

vi.mock("./eventPresets", () => ({ listPresets: vi.fn() }));
vi.mock("./guildStats", () => ({ getGuildStats: vi.fn() }));
vi.mock("./raidEventBoards", () => ({ loadRaidEvents: vi.fn() }));
vi.mock("./rankProfiles", () => ({
  getLinkedRankProfiles: vi.fn(),
  progressionRankLabels: vi.fn(),
}));

const mockPresets = vi.mocked(listPresets);
const mockStats = vi.mocked(getGuildStats);
const mockRaidEvents = vi.mocked(loadRaidEvents);
const mockProfiles = vi.mocked(getLinkedRankProfiles);
const mockRankLabels = vi.mocked(progressionRankLabels);

beforeEach(() => {
  vi.clearAllMocks();
  mockPresets.mockResolvedValue([]);
  mockStats.mockResolvedValue({ members: [] } as never);
  mockRaidEvents.mockResolvedValue([]);
  mockProfiles.mockResolvedValue({} as never);
  mockRankLabels.mockReturnValue(["Treant"]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("eventFormContext", () => {
  it("includes rank choices when profiles resolve within the grace period", async () => {
    await expect(eventFormContext(fetch)).resolves.toMatchObject({ seqRanks: ["Treant"] });
  });

  it("returns without rank choices when the profile lookup stalls", async () => {
    vi.useFakeTimers();
    mockProfiles.mockReturnValue(new Promise(() => undefined));

    const context = eventFormContext(fetch);
    await vi.advanceTimersByTimeAsync(500);

    await expect(context).resolves.toMatchObject({ seqRanks: [] });
    expect(mockRankLabels).not.toHaveBeenCalled();
  });
});
