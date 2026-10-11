import { describe, expect, it } from "vitest";
import {
  CEREMONY_RAIDS, CEREMONY_SCENES, CEREMONY_TIERS, ceremonyChance, ceremonyCountIssue, ceremonyInputIssue, ceremonyPreviewKey,
  ceremonyPreviewScene, ceremonyProposedChances, ceremonyReadinessIssue, ceremonySceneLabel, ceremonyTierLabel, type CeremonySettings,
} from "./ceremony";

// Fictional guild, channel and story ids.
const settings: CeremonySettings = {
  version: 2, guild_id: "1111111111111111111", enabled: false, channel_id: "2222222222222222222",
  stories: [{ id: "sample_story", enabled: true, weight: 30 }, { id: "other_story", enabled: true, weight: 10 }, { id: "quiet_story", enabled: false, weight: 50 }],
};

describe("ceremony settings logic", () => {
  it("computes display-only shares over enabled weights", () => {
    expect(ceremonyProposedChances(settings.stories)).toEqual(new Map([["sample_story", 75], ["other_story", 25], ["quiet_story", 0]]));
    expect(ceremonyProposedChances(settings.stories.map((story) => ({ ...story, weight: 0 })))).toBeNull();
    expect(ceremonyProposedChances([{ id: "sample_story", enabled: true, weight: 1001 }])).toBeNull();
    expect(ceremonyProposedChances([{ id: "sample_story", enabled: true, weight: 2.5 }])).toBeNull();
  });
  it("guards enabling on installed artwork, destination and an eligible story", () => {
    expect(ceremonyReadinessIssue(settings, true)).toBeNull();
    expect(ceremonyReadinessIssue(settings, false)).toContain("not installed yet");
    expect(ceremonyReadinessIssue({ ...settings, channel_id: "" }, true)).toContain("valid channel");
    expect(ceremonyReadinessIssue({ ...settings, channel_id: "18446744073709551616" }, true)).toContain("valid channel");
    expect(ceremonyReadinessIssue({ ...settings, stories: settings.stories.map((story) => ({ ...story, enabled: false })) }, true)).toBe("Enable at least one story with a positive weight.");
  });
  it("reports local input issues without blocking a disabled draft without a channel", () => {
    expect(ceremonyInputIssue(settings)).toBeNull();
    expect(ceremonyInputIssue({ ...settings, channel_id: "" })).toBeNull();
    expect(ceremonyInputIssue({ ...settings, enabled: true, channel_id: "" })).toBe("Choose a destination channel.");
    expect(ceremonyInputIssue({ ...settings, channel_id: "general" })).toBe("Choose a valid destination channel.");
    expect(ceremonyInputIssue({ ...settings, stories: [{ id: "sample_story", enabled: true, weight: -1 }] })).toBe("Use whole-number weights from 0 to 1000.");
  });
  it("resolves preview scenes, pinning As scheduled to the last loaded server scene", () => {
    const scheduled = { season: "winter", ambiance: "night" } as const;
    expect(ceremonyPreviewScene("scheduled", scheduled)).toEqual(scheduled);
    expect(ceremonyPreviewScene("normal-dusk", scheduled)).toEqual({ season: "normal", ambiance: "dusk" });
    expect(ceremonyPreviewScene("winter-dusk", { season: "normal", ambiance: "night" })).toEqual({ season: "winter", ambiance: "dusk" });
    expect(CEREMONY_SCENES.map(({ label }) => label)).toEqual(["As scheduled", "Normal dusk", "Normal night", "Snow dusk", "Snow night"]);
    expect(ceremonySceneLabel(scheduled)).toBe("Snow night");
    expect(ceremonySceneLabel({ season: "normal", ambiance: "dusk" })).toBe("Normal dusk");
  });
  it("keys stills and playback by every rendered input", () => {
    const scene = { season: "normal", ambiance: "dusk" } as const;
    const base = ceremonyPreviewKey("sample_story", "gold", "TNA", 500, scene);
    expect(ceremonyPreviewKey("sample_story", "gold", "TNA", 500, { ...scene })).toBe(base);
    for (const other of [
      ceremonyPreviewKey("other_story", "gold", "TNA", 500, scene),
      ceremonyPreviewKey("sample_story", "mythril", "TNA", 500, scene),
      ceremonyPreviewKey("sample_story", "gold", null, 500, scene),
      ceremonyPreviewKey("sample_story", "gold", "TNA", 501, scene),
      ceremonyPreviewKey("sample_story", "gold", "TNA", 500, { ...scene, ambiance: "night" }),
    ]) expect(other).not.toBe(base);
  });
  it("lists every tier and raid with exact labels and validates the sample count", () => {
    expect(CEREMONY_TIERS.map(({ label }) => label)).toEqual(["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Obsidian", "Mythril"]);
    expect(ceremonyTierLabel("diamond")).toBe("Diamond");
    expect(CEREMONY_RAIDS).toEqual(["NOTG", "TNA", "TCC", "NOL", "TWP"]);
    expect(ceremonyCountIssue(1000)).toBeNull();
    for (const bad of [0, -3, 1.5, null, undefined, 1_000_001]) expect(ceremonyCountIssue(bad)).not.toBeNull();
  });
  it("formats chances like the welcome odds", () => {
    expect(ceremonyChance(undefined)).toBe("n/a");
    expect(ceremonyChance(0)).toBe("0%");
    expect(ceremonyChance(0.05)).toBe("<0.1%");
    expect(ceremonyChance(33.333)).toBe("33.3%");
  });
});
