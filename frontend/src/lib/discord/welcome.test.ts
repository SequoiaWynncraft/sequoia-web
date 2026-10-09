import { describe, expect, it } from "vitest";
import { welcomeReadinessIssue, type WelcomeSettings, type WelcomeState } from "./welcome";

const catalog: WelcomeState["catalog"] = [
  { id: "ready", label: "Ready motif", description: "", normal_ready: true, winter_ready: true },
  { id: "pending", label: "Pending motif", description: "", normal_ready: true, winter_ready: false },
];
const settings: WelcomeSettings = {
  version: 1, guild_id: "1", channel_id: "2", enabled: false, season_mode: "normal",
  winter_start: { month: 10, day: 1 }, winter_end: { month: 3, day: 31 }, links: [],
  variants: [{ id: "ready", enabled: true, weight: 1 }, { id: "pending", enabled: true, weight: 1 }],
};

describe("proposed welcome enable guard", () => {
  it("allows the complete proposed save after disabling or zeroing a pending motif", () => {
    expect(welcomeReadinessIssue(settings, catalog)).toContain("normal and winter artwork");
    for (const change of [{ enabled: false }, { weight: 0 }]) {
      const draft = structuredClone(settings);
      Object.assign(draft.variants[1], change);
      draft.enabled = true;
      expect(welcomeReadinessIssue(draft, catalog)).toBeNull();
    }
  });
  it("distinguishes missing destination from pending artwork", () => {
    const draft = structuredClone(settings);
    draft.channel_id = "";
    expect(welcomeReadinessIssue(draft, catalog)).toContain("destination channel");
    draft.channel_id = "2";
    expect(welcomeReadinessIssue(draft, catalog)).toContain("normal and winter artwork");
  });
});
