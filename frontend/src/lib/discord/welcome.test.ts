import { describe, expect, it } from "vitest";
import { welcomeInputIssue, welcomeMessageIssue, welcomeNightIssue, welcomeNightReadinessIssue, welcomeNightSummary, welcomePreviewKey, welcomePreviewMessageChanged, welcomeReadinessIssue, welcomeSaveBody, welcomeSettingsDirty, welcomeSkyChances, welcomeStateWithNight, WELCOME_NIGHT_DEFAULT, welcomeSkyEffectIssue, type WelcomeMessage, type WelcomeSettings, type WelcomeState } from "./welcome";

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
  night: { enabled: false, start: "21:00", end: "07:00", timezone: "UTC", moon: false },
  mention_member: false,
};
const timezones = ["UTC", "Europe/Stockholm", "America/New_York"];

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
    expect(welcomeReadinessIssue(draft, catalog)).toContain("valid channel");
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
    expect(welcomeInputIssue({ ...settings, enabled: false }, timezones)).toBeNull();
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

describe("night schedule draft", () => {
  it("summarizes the default cross-midnight interval with its named timezone", () => {
    expect(welcomeNightIssue(settings.night, timezones)).toBeNull();
    expect(welcomeNightSummary(settings.night)).toBe("Night from 21:00 to 07:00 (UTC), crossing midnight");
    expect(welcomeNightSummary({ start: "01:30", end: "05:00", timezone: "Europe/Stockholm" })).toBe("Night from 01:30 to 05:00 (Europe/Stockholm)");
    expect(welcomeNightSummary({ start: "00:00", end: "23:59", timezone: "UTC" })).not.toContain("crossing midnight");
  });
  it("rejects equal endpoints as ambiguous rather than all day or never", () => {
    const night = { ...settings.night, start: "21:00", end: "21:00" };
    expect(welcomeNightIssue(night, timezones)?.end).toContain("different time");
    expect(welcomeNightSummary(night)).toBeNull();
    expect(welcomeInputIssue({ ...settings, night }, timezones)).toContain("Night:");
  });
  it("accepts only exact 24-hour HH:MM times", () => {
    for (const time of ["9:00", "24:00", "21:60", "21:00:00", "9pm", " 21:00", "", "2100"]) {
      expect(welcomeNightIssue({ ...settings.night, start: time }, timezones)?.start).toContain("24-hour");
      expect(welcomeNightIssue({ ...settings.night, end: time }, timezones)?.end).toContain("24-hour");
      expect(welcomeNightSummary({ ...settings.night, start: time })).toBeNull();
    }
    for (const time of ["00:00", "23:59", "07:05"]) expect(welcomeNightIssue({ ...settings.night, start: time }, timezones)).toBeNull();
  });
  it("accepts only a timezone from the server's list, with exact case", () => {
    for (const timezone of ["Mars/Olympus", "europe/stockholm", "CET+1", " "]) {
      expect(welcomeNightIssue({ ...settings.night, timezone }, timezones)?.timezone).toBeTruthy();
    }
    expect(welcomeNightIssue({ ...settings.night, timezone: "Europe/Stockholm" }, timezones)).toBeNull();
    // Validation applies while night is off as well, so a later enable cannot surprise the admin.
    expect(welcomeInputIssue({ ...settings, night: { ...settings.night, enabled: false, timezone: "Nowhere" } }, timezones)).toContain("timezone");
  });
  it("blocks only turning on or changing an enabled schedule while night artwork is not ready", () => {
    const saved = settings.night;
    expect(welcomeNightReadinessIssue({ ...saved, enabled: true }, saved, false)).toContain("Turn off night");
    expect(welcomeNightReadinessIssue({ ...saved, enabled: true }, saved, true)).toBeNull();
    expect(welcomeNightReadinessIssue({ ...saved, moon: true }, saved, false)).toBeNull();
    const enabled = { ...saved, enabled: true };
    expect(welcomeNightReadinessIssue(enabled, enabled, false)).toBeNull();
    expect(welcomeNightReadinessIssue({ ...enabled, start: "22:00" }, enabled, false)).toContain("Turn off night");
    expect(welcomeNightReadinessIssue({ ...enabled, enabled: false }, enabled, false)).toBeNull();
  });
  it("keys previews by explicit day, night and moon choices and by the saved schedule they follow", () => {
    const message = settings.message;
    const base = welcomePreviewKey("ready", "normal", "Member", message, "none", "minecraft");
    expect(welcomePreviewKey("ready", "normal", "Member", message, "none", "minecraft", {})).toBe(base);
    const keys = [
      { saved: settings.night },
      { night: false, saved: settings.night },
      { night: true, saved: settings.night },
      { night: true, moon: true, saved: settings.night },
      { night: true, moon: false, saved: settings.night },
      { moon: false, saved: settings.night },
    ].map((scene) => welcomePreviewKey("ready", "normal", "Member", message, "none", "minecraft", scene));
    expect(new Set(keys).size).toBe(keys.length);
    // Following the saved schedule or moon must not reuse a still rendered before that setting changed.
    const changed = { ...settings.night, moon: true };
    expect(welcomePreviewKey("ready", "normal", "Member", message, "none", "minecraft", { saved: changed })).not.toBe(keys[0]);
    expect(welcomePreviewKey("ready", "normal", "Member", message, "none", "minecraft", { night: true, saved: changed })).not.toBe(keys[2]);
    // Fully explicit scenes do not depend on the saved schedule.
    expect(welcomePreviewKey("ready", "normal", "Member", message, "none", "minecraft", { night: true, moon: false, saved: changed })).toBe(keys[4]);
  });
});

describe("servers without night scheduling", () => {
  const legacySettings = welcomeSaveBody(settings, false, true);
  const legacy = {
    settings: legacySettings, catalog, effective_season: "normal" as const, effective_chances: [], ready: true,
    viewer: { display_name: "Member" }, fonts: [], effects: { sky: [] }, effective_effect_chances: { sky: [] },
  };
  it("fills the documented defaults and reports night as unsupported", () => {
    const { state, nightSupported } = welcomeStateWithNight(structuredClone(legacy));
    expect(nightSupported).toBe(false);
    expect(state.settings.night).toEqual({ enabled: false, start: "21:00", end: "07:00", timezone: "UTC", moon: false });
    expect(state.effective_night).toEqual({ active: false, scheduled: false, local_time: null, timezone: "UTC", ready: false, timezones: [] });
    expect(WELCOME_NIGHT_DEFAULT).toEqual(settings.night);
  });
  it("never sends night back to an older server, and keeps it for a current one", () => {
    expect(legacySettings).not.toHaveProperty("night");
    expect(legacySettings).toEqual(Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "night")));
    expect(welcomeSaveBody(settings, true, true)).toEqual(settings);
    const saved = { ...settings, night: { ...settings.night, moon: true } };
    const { state, nightSupported } = welcomeStateWithNight({ ...legacy, settings: saved, effective_night: { active: true, scheduled: true, local_time: "22:00", timezone: "UTC", ready: true, timezones } });
    expect(nightSupported).toBe(true);
    expect(state.settings.night).toEqual(saved.night);
    expect(state.settings.night.moon).toBe(true);
  });
  it("skips night validation when the server has no timezone list for it", () => {
    const { state } = welcomeStateWithNight(structuredClone(legacy));
    expect(welcomeInputIssue(state.settings, null)).toBeNull();
    expect(welcomeInputIssue(state.settings, [])).toContain("Night:");
  });
});

describe("welcome mention setting", () => {
  const response = {
    settings, catalog, effective_season: "normal" as const, effective_chances: [], ready: true,
    viewer: { display_name: "Member" }, fonts: [], effects: { sky: [] }, effective_effect_chances: { sky: [] },
    effective_night: { active: false, scheduled: false, local_time: null, timezone: "UTC", ready: true, timezones },
  };
  it("keeps a saved mention setting and sends it to a current server", () => {
    const { state, mentionSupported } = welcomeStateWithNight({ ...response, settings: { ...settings, mention_member: true } });
    expect(mentionSupported).toBe(true);
    expect(state.settings.mention_member).toBe(true);
    expect(welcomeSaveBody(state.settings, true, true)).toMatchObject({ mention_member: true, night: settings.night });
  });
  it("reads an older server as off and never sends the field back", () => {
    const { mention_member: _mention, ...older } = settings;
    const { state, mentionSupported } = welcomeStateWithNight({ ...response, settings: older });
    expect(mentionSupported).toBe(false);
    expect(state.settings.mention_member).toBe(false);
    const body = welcomeSaveBody(state.settings, true, false);
    expect(body).not.toHaveProperty("mention_member");
    expect(body).toEqual(Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "mention_member")));
    expect(welcomeSaveBody(state.settings, false, false)).not.toHaveProperty("night");
  });
  it("marks a mention change as unsaved and clears it when toggled back", () => {
    const draft = structuredClone(settings);
    expect(welcomeSettingsDirty(draft, settings)).toBe(false);
    draft.mention_member = true;
    expect(welcomeSettingsDirty(draft, settings)).toBe(true);
    draft.mention_member = false;
    expect(welcomeSettingsDirty(draft, settings)).toBe(false);
  });
});
