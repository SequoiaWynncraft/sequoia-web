import { describe, expect, it } from "vitest";
import { welcomeInputIssue, welcomeMessageIssue, welcomePreviewKey, welcomePreviewMessageChanged, welcomeReadinessIssue, welcomeSkyChances, welcomeSkyEffectIssue, type WelcomeMessage, type WelcomeSettings, type WelcomeState } from "./welcome";

const catalog: WelcomeState["catalog"] = [
  { id: "ready", label: "Ready motif", description: "", normal_ready: true, winter_ready: true },
  { id: "pending", label: "Pending motif", description: "", normal_ready: true, winter_ready: false },
];
const settings: WelcomeSettings = {
  version: 1, guild_id: "1", channel_id: "2", enabled: false, season_mode: "normal",
  winter_start: { month: 10, day: 1 }, winter_end: { month: 3, day: 31 }, links: [],
  variants: [{ id: "ready", enabled: true, weight: 1 }, { id: "pending", enabled: true, weight: 1 }],
  message: { headline: "Welcome", subtitle: "TO SEQUOIA", font: "minecraft" },
  name_font: "minecraft",
  effects: { sky: [{ id: "aurora", percent: 35 }] },
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

describe("independent welcome sky effects", () => {
  const effects: WelcomeState["effects"]["sky"] = [{ id: "aurora", label: "Aurora Borealis", description: "", normal_ready: true, winter_ready: true }];
  it("uses absolute percentages and a no-effect remainder, without editing welcome weights", () => {
    const draft = structuredClone(settings);
    expect(welcomeSkyChances(draft.effects.sky, effects)?.get("none")).toBe(65);
    draft.effects.sky[0].percent = 50;
    expect(welcomeSkyChances(draft.effects.sky, effects)?.get("aurora")).toBe(50);
    expect(welcomeSkyChances(draft.effects.sky, effects)?.get("none")).toBe(50);
    expect(draft.variants).toEqual(settings.variants);
    draft.effects.sky[0].percent = 0;
    expect(welcomeSkyChances(draft.effects.sky, effects)?.get("none")).toBe(100);
  });
  it("falls back unavailable seasonal artwork to no effect without blocking emergency disable", () => {
    const pending = [{ ...effects[0], winter_ready: false }];
    expect(welcomeSkyChances(settings.effects.sky, pending)?.get("aurora")).toBe(0);
    expect(welcomeSkyChances(settings.effects.sky, pending)?.get("none")).toBe(100);
    expect(welcomeInputIssue({ ...settings, enabled: false })).toBeNull();
  });
  it("rejects invalid percentages and totals, rather than displaying a false zero", () => {
    for (const percent of [-1, 101, 0.5, Number.NaN]) {
      const sky = [{ id: "aurora" as const, percent }];
      expect(welcomeSkyEffectIssue(sky)).toContain("whole-number");
      expect(welcomeSkyChances(sky, effects)).toBeNull();
    }
    expect(welcomeSkyEffectIssue([{ id: "aurora", percent: 60 }, { id: "aurora", percent: 50 }])).toContain("total 100 or less");
  });
  it("separates explicit effect previews from both their still cache and the saved random odds", () => {
    const none = welcomePreviewKey("ready", "normal", "Member", settings.message, "none");
    expect(welcomePreviewKey("ready", "normal", "Member", settings.message)).toBe(none);
    expect(welcomePreviewKey("ready", "normal", "Member", settings.message, "aurora")).not.toBe(none);
    expect(welcomePreviewMessageChanged(settings.message, structuredClone(settings.message))).toBe(false);
  });
});

describe("welcome message draft", () => {
  it("keys stills and animation by independent name font without invalidating greeting copy", () => {
    const message = structuredClone(settings.message);
    const key = welcomePreviewKey("ready", "normal", "Member", message, "none");
    expect(welcomePreviewKey("ready", "normal", "Member", message, "none", "minecraft")).toBe(key);
    for (const font of ["jersey_15", "pixelify_sans"] as const) {
      expect(welcomePreviewKey("ready", "normal", "Member", message, "none", font)).not.toBe(key);
      expect(welcomePreviewMessageChanged(settings.message, message)).toBe(false);
      expect(message).toEqual(settings.message);
    }
  });
  it("retains a previous still when only motif, season or sample name changes", () => {
    const previous = structuredClone(settings.message);
    const previousKey = welcomePreviewKey("ready", "normal", "Member", previous);
    for (const [motif, season, name] of [["pending", "normal", "Member"], ["ready", "winter", "Member"], ["ready", "normal", "Another member"]] as const) {
      const next = structuredClone(previous);
      expect(welcomePreviewKey(motif, season, name, next)).not.toBe(previousKey);
      expect(welcomePreviewMessageChanged(previous, next)).toBe(false);
    }
  });
  it("clears the previous still for each copy or font edit, including a combined motif change", () => {
    const previous = structuredClone(settings.message);
    for (const edit of [{ headline: "Hello" }, { subtitle: "to Sequoia" }, { font: "jersey_15" as const }]) {
      const next = { ...previous, ...edit };
      expect(welcomePreviewMessageChanged(previous, next)).toBe(true);
      expect(welcomePreviewKey("pending", "winter", "Another member", next)).not.toBe(welcomePreviewKey("ready", "normal", "Member", previous));
    }
  });
  it("keeps exact case and includes every rendering input in the still/playback identity", () => {
    const message: WelcomeMessage = { headline: "Welcome", subtitle: "to Sequoia", font: "jersey_15" };
    const key = welcomePreviewKey("ready", "normal", "Member", message);
    expect(welcomePreviewKey("ready", "normal", "Member", structuredClone(message))).toBe(key);
    for (const changed of [{ headline: "HELLO" }, { subtitle: "TO SEQUOIA" }, { font: "pixelify_sans" as const }]) {
      expect(welcomePreviewKey("ready", "normal", "Member", { ...message, ...changed })).not.toBe(key);
    }
    expect(welcomePreviewKey("pending", "normal", "Member", message)).not.toBe(key);
    expect(welcomePreviewKey("ready", "winter", "Member", message)).not.toBe(key);
    expect(welcomePreviewKey("ready", "normal", "Another member", message)).not.toBe(key);
    expect(message.subtitle).toBe("to Sequoia");
  });
  it("rejects empty, multiline and over-limit text without truncating a draft", () => {
    for (const field of ["headline", "subtitle"] as const) {
      for (const text of [" ", "Line\nBreak", "Tab\tBreak", "a".repeat(65)]) {
        const message = { ...settings.message, [field]: text };
        expect(welcomeMessageIssue(message)).not.toBeNull();
        expect(message[field]).toBe(text);
      }
    }
    expect(welcomeMessageIssue({ ...settings.message, headline: "😀".repeat(64) })).toBeNull();
    expect(welcomeMessageIssue(settings.message)).toBeNull();
  });
});
