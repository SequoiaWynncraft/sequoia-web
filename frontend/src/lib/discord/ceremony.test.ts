import { describe, expect, it } from "vitest";
import {
  CEREMONY_BADGE_TITLE_MAX, ceremonyAchievementBody, ceremonyAchievementDescription, ceremonyAchievementIssue, ceremonyBadgeTitleIssue,
  ceremonyCategories, ceremonyKeyLabel, ceremonyRoleLabel, type CeremonyAchievement, type CeremonyCategory,
  CEREMONY_RAIDS, CEREMONY_SCENES, CEREMONY_TIERS, ceremonyChance, ceremonyCountIssue, ceremonyInputIssue, ceremonyPreviewKey,
  ceremonyPreviewScene, ceremonyProposedChances, ceremonyReadinessIssue, ceremonySaveBody, ceremonySceneLabel, ceremonySettingsDirty, ceremonyState, ceremonyTierLabel,
  type CeremonyResponse, type CeremonySettings, ceremonyImagesInUse, IMAGE_TIERS_DEFAULT,
} from "./ceremony";

// Fictional guild, channel and story ids.
const settings: CeremonySettings = {
  version: 2, guild_id: "1111111111111111111", enabled: false, channel_id: "2222222222222222222",
  stories: [{ id: "sample_story", enabled: true, weight: 30 }, { id: "other_story", enabled: true, weight: 10 }, { id: "quiet_story", enabled: false, weight: 50 }],
  mention_member: false,
  send_images: true,
  image_tiers: { bronze: false, silver: false, gold: true, platinum: true, diamond: true, obsidian: true, mythril: true, badge: true },
  repeat: { percent: 50, recent: 1 },
};

describe("ceremony repeat penalty", () => {
  const { repeat: _repeat, ...legacySettings } = settings;
  const response = { settings: legacySettings, catalog: [], ready: true, effective_chances: [], effective_scene: { season: "normal" as const, ambiance: "dusk" as const }, viewer: { display_name: "FictionalMember" } };
  it("fills the default for an older server and never sends repeat back to it", () => {
    const { state, repeatSupported } = ceremonyState(structuredClone(response));
    expect(repeatSupported).toBe(false);
    expect(state.settings.repeat).toEqual({ percent: 50, recent: 1 });
    expect(ceremonySaveBody(state.settings, true, false, true, true)).toEqual(legacySettings);
  });
  it("keeps and sends the server's repeat setting", () => {
    const { state, repeatSupported } = ceremonyState({ ...response, settings: { ...legacySettings, repeat: { percent: 0, recent: 5 } }, recent_events: ["sample_story"] });
    expect(repeatSupported).toBe(true);
    expect(ceremonySaveBody(state.settings, true, true, true, true)).toEqual({ ...legacySettings, repeat: { percent: 0, recent: 5 } });
  });
  it("rejects an invalid repeat penalty before save", () => {
    expect(ceremonyInputIssue({ ...settings, repeat: { percent: -1, recent: 1 } })).toContain("Repeat penalty");
    expect(ceremonyInputIssue({ ...settings, repeat: { percent: 50, recent: 21 } })).toContain("Recent events");
  });
});

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
  it("needs no artwork for text-only ceremonies but still needs a channel", () => {
    const textOnly = { ...settings, send_images: false };
    expect(ceremonyReadinessIssue(textOnly, false)).toBeNull();
    expect(ceremonyReadinessIssue({ ...textOnly, channel_id: "" }, false)).toContain("valid channel");
    expect(ceremonyReadinessIssue({ ...textOnly, stories: settings.stories.map((story) => ({ ...story, enabled: false })) }, false)).toBe("Enable at least one story with a positive weight.");
    // An older server always sends images, so the caller passes true.
    expect(ceremonyReadinessIssue(textOnly, false, true)).toContain("not installed yet");
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
    const raid = { kind: "raid", raid: "TNA", tier: "gold", count: 500 } as const;
    const base = ceremonyPreviewKey("sample_story", raid, scene);
    expect(ceremonyPreviewKey("sample_story", { ...raid }, { ...scene })).toBe(base);
    const others = [
      ceremonyPreviewKey("other_story", raid, scene),
      ceremonyPreviewKey("sample_story", { ...raid, tier: "mythril" }, scene),
      ceremonyPreviewKey("sample_story", { ...raid, raid: null }, scene),
      ceremonyPreviewKey("sample_story", { ...raid, count: 501 }, scene),
      ceremonyPreviewKey("sample_story", raid, { ...scene, ambiance: "night" }),
      ceremonyPreviewKey("sample_story", { kind: "war", tier: "gold", count: 500 }, scene),
      ceremonyPreviewKey("sample_story", { kind: "profession", profession: "mining", level: 110 }, scene),
      ceremonyPreviewKey("sample_story", { kind: "profession", profession: "mining", level: 120 }, scene),
      ceremonyPreviewKey("sample_story", { kind: "role", category: "insignia", tier: "gold", label: "Gold Insignia" }, scene),
      ceremonyPreviewKey("sample_story", { kind: "badge", title: "Founder" }, scene),
    ];
    for (const other of others) expect(other).not.toBe(base);
    expect(new Set(others).size).toBe(others.length);
    // A trimmed badge title renders the same image.
    expect(ceremonyPreviewKey("sample_story", { kind: "badge", title: " Founder " }, scene)).toBe(others.at(-1));
  });
  it("accepts a well-formed catalog in order and falls back to raid-only without one", () => {
    const tiers = CEREMONY_TIERS.map(({ id }) => id as string);
    const catalog: CeremonyCategory[] = [
      { kind: "raid", label: "Raids", raids: ["All raids", "NOTG", "TNA"], tiers },
      { kind: "war", label: "Guild wars", tiers },
      { kind: "profession", label: "Professions", professions: ["fishing", "mining"], levels: [100, 110, 120, 132] },
      { kind: "role", label: "Roles", categories: ["insignia", "war_honour"], tiers: ["bronze", "silver", "gold", "diamond"] },
      { kind: "badge", label: "Badges" },
    ];
    expect(ceremonyCategories({ achievement_catalog: catalog })).toEqual(catalog);
    expect(ceremonyCategories({})).toBeNull();
    expect(ceremonyCategories({ achievement_catalog: [] })).toBeNull();
    const mixed = [{ kind: "future", label: "Future" }, { kind: "war", label: "Guild wars", tiers: [] }, { kind: "profession", label: "P", professions: ["mining"], levels: [1.5] }, catalog[4]];
    expect(ceremonyCategories({ achievement_catalog: mixed as never })).toEqual([catalog[4]]);
  });
  it("describes, validates and serializes every category", () => {
    expect(ceremonyKeyLabel("war_honour")).toBe("War Honour");
    expect(ceremonyRoleLabel("insignia", "gold")).toBe("Gold Insignia");
    expect(ceremonyTierLabel("unlisted_tier")).toBe("Unlisted Tier");
    const samples: [CeremonyAchievement, string][] = [
      [{ kind: "raid", raid: null, tier: "diamond", count: 1000 }, "Diamond with 1,000 raids in All raids"],
      [{ kind: "war", tier: "gold", count: 100 }, "Gold with 100 guild wars"],
      [{ kind: "profession", profession: "mining", level: 110 }, "Mining level 110"],
      [{ kind: "role", category: "insignia", tier: "gold", label: "Gold Insignia" }, "Gold Insignia"],
      [{ kind: "badge", title: "Founder" }, "Founder badge"],
    ];
    for (const [achievement, description] of samples) {
      expect(ceremonyAchievementDescription(achievement)).toBe(description);
      expect(ceremonyAchievementIssue(achievement)).toBeNull();
      expect(ceremonyAchievementBody(achievement, false)).toEqual({ achievement });
    }
    expect(ceremonyAchievementBody({ kind: "raid", raid: "TNA", tier: "diamond", count: 1000 }, true)).toEqual({ tier: "diamond", raid: "TNA", count: 1000 });
    expect(ceremonyAchievementBody({ kind: "badge", title: "  Founder " }, false)).toEqual({ achievement: { kind: "badge", title: "Founder" } });
    expect(ceremonyAchievementIssue({ kind: "war", tier: "gold", count: 0 })).toBe("Use a whole number from 1 to 1,000,000.");
    expect(ceremonyAchievementIssue({ kind: "badge", title: "   " })).toBe("Enter a badge title.");
    expect(ceremonyBadgeTitleIssue("x".repeat(CEREMONY_BADGE_TITLE_MAX + 1))).toBe(`Use ${CEREMONY_BADGE_TITLE_MAX} characters or fewer.`);
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

describe("ceremony mention setting", () => {
  const response = (wire: CeremonyResponse["settings"]): CeremonyResponse => ({
    settings: wire, catalog: [], ready: true, effective_chances: [],
    effective_scene: { season: "normal", ambiance: "dusk" }, viewer: { display_name: "Member" },
  });
  it("keeps a saved mention setting and sends it to a current server", () => {
    const { state, mentionSupported } = ceremonyState(response({ ...settings, mention_member: true }));
    expect(mentionSupported).toBe(true);
    expect(state.settings.mention_member).toBe(true);
    expect(ceremonySaveBody(state.settings, true, true, true, true)).toEqual({ ...settings, mention_member: true });
  });
  it("reads an older server as off and never sends the field back", () => {
    const { mention_member: _mention, ...older } = settings;
    const { state, mentionSupported } = ceremonyState(response(older));
    expect(mentionSupported).toBe(false);
    expect(state.settings.mention_member).toBe(false);
    const body = ceremonySaveBody(state.settings, false, true, true, true);
    expect(body).not.toHaveProperty("mention_member");
    expect(body).toEqual(older);
  });
  it("marks a mention change as unsaved and clears it when toggled back", () => {
    const draft = structuredClone(settings);
    expect(ceremonySettingsDirty(draft, settings)).toBe(false);
    draft.mention_member = true;
    expect(ceremonySettingsDirty(draft, settings)).toBe(true);
    draft.mention_member = false;
    expect(ceremonySettingsDirty(draft, settings)).toBe(false);
  });
});

describe("ceremony images setting", () => {
  const response = (wire: CeremonyResponse["settings"]): CeremonyResponse => ({
    settings: wire, catalog: [], ready: true, effective_chances: [],
    effective_scene: { season: "normal", ambiance: "dusk" }, viewer: { display_name: "Member" },
  });
  it("keeps an explicit off and sends it to a current server", () => {
    const { state, imagesSupported } = ceremonyState(response({ ...settings, send_images: false }));
    expect(imagesSupported).toBe(true);
    expect(state.settings.send_images).toBe(false);
    expect(ceremonySaveBody(state.settings, true, true, true, true)).toEqual({ ...settings, send_images: false });
  });
  it("reads an older server as on and never sends the field back", () => {
    const { send_images: _images, ...older } = settings;
    const { state, imagesSupported } = ceremonyState(response(older));
    expect(imagesSupported).toBe(false);
    expect(state.settings.send_images).toBe(true);
    const body = ceremonySaveBody(state.settings, true, true, false, true);
    expect(body).not.toHaveProperty("send_images");
    expect(body).toEqual(older);
  });
  it("marks an images change as unsaved and clears it when toggled back", () => {
    const draft = structuredClone(settings);
    expect(ceremonySettingsDirty(draft, settings)).toBe(false);
    draft.send_images = false;
    expect(ceremonySettingsDirty(draft, settings)).toBe(true);
    draft.send_images = true;
    expect(ceremonySettingsDirty(draft, settings)).toBe(false);
  });
});

describe("ceremony image tiers setting", () => {
  const response = (wire: CeremonyResponse["settings"]): CeremonyResponse => ({
    settings: wire, catalog: [], ready: true, effective_chances: [],
    effective_scene: { season: "normal", ambiance: "dusk" }, viewer: { display_name: "Member" },
  });
  const { image_tiers: _tiers, ...older } = settings;
  it("reads an absent field as the defaults, Bronze and Silver off, and never sends it back", () => {
    const { state, imageTiersSupported } = ceremonyState(response(older));
    expect(imageTiersSupported).toBe(false);
    expect(state.settings.image_tiers).toEqual({ bronze: false, silver: false, gold: true, platinum: true, diamond: true, obsidian: true, mythril: true, badge: true });
    expect(state.settings.image_tiers).toEqual(IMAGE_TIERS_DEFAULT);
    const body = ceremonySaveBody(state.settings, true, true, true, false);
    expect(body).not.toHaveProperty("image_tiers");
    expect(body).toEqual(older);
  });
  it("fills a partial object from the defaults and sends the full value to a current server", () => {
    const { state, imageTiersSupported } = ceremonyState(response({ ...older, image_tiers: { bronze: true, badge: false } }));
    expect(imageTiersSupported).toBe(true);
    const full = { ...IMAGE_TIERS_DEFAULT, bronze: true, badge: false };
    expect(state.settings.image_tiers).toEqual(full);
    expect(ceremonySaveBody(state.settings, true, true, true, true)).toEqual({ ...older, image_tiers: full });
  });
  it("marks a tier change as unsaved and clears it when toggled back", () => {
    const draft = structuredClone(settings);
    draft.image_tiers.gold = false;
    expect(ceremonySettingsDirty(draft, settings)).toBe(true);
    draft.image_tiers.gold = true;
    expect(ceremonySettingsDirty(draft, settings)).toBe(false);
  });
  it("treats images as in use only with send_images and at least one tier on", () => {
    const none = Object.fromEntries(Object.keys(IMAGE_TIERS_DEFAULT).map((key) => [key, false])) as CeremonySettings["image_tiers"];
    expect(ceremonyImagesInUse(settings, true, true)).toBe(true);
    expect(ceremonyImagesInUse({ ...settings, send_images: false }, true, true)).toBe(false);
    expect(ceremonyImagesInUse({ ...settings, image_tiers: none }, true, true)).toBe(false);
    // Unsupported fields read as on, so an older server keeps the artwork rule.
    expect(ceremonyImagesInUse({ ...settings, image_tiers: none }, true, false)).toBe(true);
    expect(ceremonyImagesInUse({ ...settings, send_images: false }, false, true)).toBe(true);
    expect(ceremonyReadinessIssue({ ...settings, image_tiers: none }, false)).toBeNull();
    expect(ceremonyReadinessIssue({ ...settings, image_tiers: none, channel_id: "" }, false)).toContain("valid channel");
  });
});
