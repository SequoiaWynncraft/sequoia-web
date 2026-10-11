import { describe, expect, it } from "vitest";
import {
  CEREMONY_BADGE_TITLE_MAX, ceremonyAchievementBody, ceremonyAchievementDescription, ceremonyAchievementIssue, ceremonyBadgeTitleIssue,
  ceremonyCategories, ceremonyKeyLabel, ceremonyRoleLabel, type CeremonyAchievement, type CeremonyCategory,
  CEREMONY_RAIDS, CEREMONY_SCENES, CEREMONY_TIERS, ceremonyChance, ceremonyCountIssue, ceremonyInputIssue, ceremonyPreviewKey,
  ceremonyPreviewScene, ceremonyProposedChances, ceremonyReadinessIssue, ceremonySaveBody, ceremonySceneLabel, ceremonySettingsDirty, ceremonyState, ceremonyTierLabel, ceremonyTierStories, ceremonyToggleTierStory,
  type CeremonyResponse, type CeremonySettings, ceremonyImagesInUse, IMAGE_TIERS_DEFAULT, ceremonyCatalogRows, ceremonySuggestedTiers,
  ceremonyCrashTextIssues, ceremonyFilmChances, ceremonyFilmMode, ceremonyFilms, ceremonyPreviewFilm, ceremonyScreenIssue, ceremonyScreeningBody,
  SCREEN_DEFAULT, type CeremonyFilm,
} from "./ceremony";
import { repeatChances } from "./repeat";

// Fictional guild, channel and story ids.
const settings: CeremonySettings = {
  version: 2, guild_id: "1111111111111111111", enabled: false, channel_id: "2222222222222222222",
  stories: [{ id: "sample_story", enabled: true, weight: 30 }, { id: "other_story", enabled: true, weight: 10 }, { id: "quiet_story", enabled: false, weight: 50 }],
  story_tiers: {},
  mention_member: false,
  send_images: true,
  image_tiers: { bronze: false, silver: false, gold: true, platinum: true, diamond: true, obsidian: true, mythril: true, badge: true },
  repeat: { percent: 50, recent: 1 },
  screen: structuredClone(SCREEN_DEFAULT),
};

describe("ceremony repeat penalty", () => {
  const { repeat: _repeat, ...legacySettings } = settings;
  const response = { settings: legacySettings, catalog: [], ready: true, effective_chances: [], effective_scene: { season: "normal" as const, ambiance: "dusk" as const }, viewer: { display_name: "FictionalMember" } };
  it("fills the default for an older server and never sends repeat back to it", () => {
    const { state, repeatSupported } = ceremonyState(structuredClone(response));
    expect(repeatSupported).toBe(false);
    expect(state.settings.repeat).toEqual({ percent: 50, recent: 1 });
    expect(ceremonySaveBody(state.settings, true, false, true, true, true, true)).toEqual(legacySettings);
  });
  it("keeps and sends the server's repeat setting", () => {
    const { state, repeatSupported } = ceremonyState({ ...response, settings: { ...legacySettings, repeat: { percent: 0, recent: 5 } }, recent_events: ["sample_story"] });
    expect(repeatSupported).toBe(true);
    expect(ceremonySaveBody(state.settings, true, true, true, true, true, true)).toEqual({ ...legacySettings, repeat: { percent: 0, recent: 5 } });
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
    expect(ceremonySaveBody(state.settings, true, true, true, true, true, true)).toEqual({ ...settings, mention_member: true });
  });
  it("reads an older server as off and never sends the field back", () => {
    const { mention_member: _mention, ...older } = settings;
    const { state, mentionSupported } = ceremonyState(response(older));
    expect(mentionSupported).toBe(false);
    expect(state.settings.mention_member).toBe(false);
    const body = ceremonySaveBody(state.settings, false, true, true, true, true, true);
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
    expect(ceremonySaveBody(state.settings, true, true, true, true, true, true)).toEqual({ ...settings, send_images: false });
  });
  it("reads an older server as on and never sends the field back", () => {
    const { send_images: _images, ...older } = settings;
    const { state, imagesSupported } = ceremonyState(response(older));
    expect(imagesSupported).toBe(false);
    expect(state.settings.send_images).toBe(true);
    const body = ceremonySaveBody(state.settings, true, true, false, true, true, true);
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
    const body = ceremonySaveBody(state.settings, true, true, true, false, true, true);
    expect(body).not.toHaveProperty("image_tiers");
    expect(body).toEqual(older);
  });
  it("fills a partial object from the defaults and sends the full value to a current server", () => {
    const { state, imageTiersSupported } = ceremonyState(response({ ...older, image_tiers: { bronze: true, badge: false } }));
    expect(imageTiersSupported).toBe(true);
    const full = { ...IMAGE_TIERS_DEFAULT, bronze: true, badge: false };
    expect(state.settings.image_tiers).toEqual(full);
    expect(ceremonySaveBody(state.settings, true, true, true, true, true, true)).toEqual({ ...older, image_tiers: full });
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


describe("tier animation policy", () => {
  const response = (settings: CeremonyResponse["settings"]): CeremonyResponse => ({ settings, catalog: [], ready: true, effective_chances: [], effective_scene: { season: "normal", ambiance: "dusk" }, viewer: { display_name: "FictionalMember" } });
  it("preserves sparse defaults and explicit text-only tiers independently", () => {
    const base = response({ ...settings, story_tiers: { silver: [], gold: ["sample_story"] } });
    const loaded = ceremonyState(base);
    expect(loaded.storyTiersSupported).toBe(true);
    expect(ceremonyTierStories(loaded.state.settings, "diamond")).toEqual(settings.stories);
    expect(ceremonyTierStories(loaded.state.settings, "gold").filter(story => story.enabled).map(story => story.id)).toEqual(["sample_story"]);
    expect(ceremonyTierStories(loaded.state.settings, "silver").every(story => !story.enabled)).toBe(true);
    loaded.state.settings.story_tiers.gold?.push("other_story");
    expect(base.settings.story_tiers?.gold).toEqual(["sample_story"]);
  });
  it("only sends the policy to a supporting server", () => {
    const { story_tiers: _policy, ...older } = settings;
    const loaded = ceremonyState(response(older));
    expect(loaded.storyTiersSupported).toBe(false);
    expect(ceremonySaveBody(loaded.state.settings, true, true, true, true, false, true)).not.toHaveProperty("story_tiers");
    expect(ceremonySaveBody(settings, true, true, true, true, true, true).story_tiers).toEqual({});
  });
  it("computes odds inside the allowed set and respects image switches", () => {
    const draft = { ...settings, story_tiers: { gold: ["other_story"], diamond: [] } };
    expect(ceremonyProposedChances(ceremonyTierStories(draft, "gold"))).toEqual(new Map([["sample_story", 0], ["other_story", 100], ["quiet_story", 0]]));
    const textOnly = { ...draft, story_tiers: Object.fromEntries(Object.keys(IMAGE_TIERS_DEFAULT).map(tier => [tier, []])) };
    expect(ceremonyImagesInUse(textOnly, true, true)).toBe(false);
    expect(ceremonyReadinessIssue(textOnly, false)).toBeNull();
    expect(ceremonyImagesInUse({ ...draft, send_images: false }, true, true)).toBe(false);
  });
  it("rejects unknown and duplicate animations without rejecting empty lists", () => {
    expect(ceremonyInputIssue({ ...settings, story_tiers: { gold: [] } })).toBeNull();
    expect(ceremonyInputIssue({ ...settings, story_tiers: { gold: ["missing"] } })).toContain("installed animations");
    expect(ceremonyInputIssue({ ...settings, story_tiers: { gold: ["sample_story", "sample_story"] } })).toContain("installed animations");
  });
  it("preserves a newer server's unknown tier while permitting unrelated edits", () => {
    const policy = { future_tier: ["future_story"], gold: ["sample_story"] };
    const loaded = ceremonyState(response({ ...settings, story_tiers: policy }));
    loaded.state.settings.mention_member = true;
    expect(ceremonyInputIssue(loaded.state.settings)).toBeNull();
    expect(ceremonySaveBody(loaded.state.settings, true, true, true, true, true, true).story_tiers).toEqual(policy);
  });
  it("restores the default after undo and automatically allows a later installed story", () => {
    const draft = structuredClone(settings);
    draft.story_tiers = ceremonyToggleTierStory(draft, settings, "gold", "sample_story", false);
    expect(ceremonySettingsDirty(draft, settings)).toBe(true);
    draft.story_tiers = ceremonyToggleTierStory(draft, settings, "gold", "sample_story", true);
    expect(ceremonySettingsDirty(draft, settings)).toBe(false);
    draft.stories.push({ id: "later_story", enabled: true, weight: 10 });
    expect(ceremonyTierStories(draft, "gold").find(story => story.id === "later_story")?.enabled).toBe(true);
  });
  it("keeps a saved explicit set pinned when an edit is undone", () => {
    const saved = { ...settings, story_tiers: { gold: settings.stories.map(story => story.id), silver: [] } };
    const draft = structuredClone(saved);
    draft.story_tiers = ceremonyToggleTierStory(draft, saved, "gold", "sample_story", false) as typeof draft.story_tiers;
    draft.story_tiers = ceremonyToggleTierStory(draft, saved, "gold", "sample_story", true) as typeof draft.story_tiers;
    expect(ceremonySettingsDirty(draft, saved)).toBe(false);
    expect(ceremonyTierStories(draft, "silver").every(story => !story.enabled)).toBe(true);
  });
  it("requires artwork for a server-defined image tier even when every known tier is off", () => {
    const none = Object.fromEntries(Object.keys(IMAGE_TIERS_DEFAULT).map(tier => [tier, false])) as CeremonySettings["image_tiers"];
    const draft = { ...settings, image_tiers: { ...none, future_tier: true }, story_tiers: { future_tier: ["sample_story"] } };
    expect(ceremonyImagesInUse(draft, true, true)).toBe(true);
    expect(ceremonyReadinessIssue(draft, false)).toContain("artwork");
    expect(ceremonyImagesInUse({ ...draft, story_tiers: { future_tier: [] } }, true, true)).toBe(false);
    expect(ceremonyImagesInUse({ ...draft, send_images: false }, true, true)).toBe(false);
  });
});

describe("twelve-story catalog", () => {
  // Five fictional original stories, then the seven a newer server appends in catalog order: disabled at weight 0.
  const original = [
    { id: "sample_story", enabled: true, weight: 30 }, { id: "other_story", enabled: true, weight: 10 },
    { id: "meadow_story", enabled: true, weight: 20 }, { id: "harbor_story", enabled: true, weight: 20 }, { id: "summit_story", enabled: true, weight: 20 },
  ];
  const added = ["still_pool", "parliament_of_owls", "lantern_constellation", "golden_acorn", "forest_procession", "forge_beneath_roots", "great_sequoia_wakes"];
  const twelve: CeremonySettings = { ...settings, stories: [...original, ...added.map(id => ({ id, enabled: false, weight: 0 }))] };
  const ids = twelve.stories.map(story => story.id);
  const catalog = ids.map((id, index) => ({ id, label: ceremonyKeyLabel(id), description: "", layout: "banner", ready: true, ...(index < 5 ? {} : { recommended_tiers: ["diamond", "obsidian"] }) }));
  const response: CeremonyResponse = { settings: twelve, catalog, ready: true, effective_chances: [], effective_scene: { season: "normal", ambiance: "dusk" }, viewer: { display_name: "FictionalMember" } };

  it("gives disabled zero-weight stories no share and leaves the others exact", () => {
    const shares = ceremonyProposedChances(twelve.stories);
    expect(shares?.size).toBe(12);
    expect(original.map(({ id }) => shares?.get(id))).toEqual([30, 10, 20, 20, 20]);
    for (const id of added) expect(shares?.get(id)).toBe(0);
    // Enabled at weight 0 or weighted while disabled, a story still never wins.
    const edited = twelve.stories.map(story => story.id === "still_pool" ? { ...story, enabled: true } : story.id === "golden_acorn" ? { ...story, weight: 40 } : story);
    expect(ceremonyProposedChances(edited)).toEqual(shares);
    const next = repeatChances(twelve.stories, { percent: 50, recent: 1 }, ["sample_story"]);
    for (const id of added) expect(next?.get(id)).toBe(0);
    expect(next?.get("sample_story")).toBeCloseTo(1500 * 100 / 8500, 6);
    expect([...next!.values()].reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 6);
    expect(ceremonyReadinessIssue(twelve, true)).toBeNull();
  });
  it("lists new stories for every tier and accepts them in a tier's allowed list", () => {
    expect(ceremonyTierStories(twelve, "diamond").map(story => story.id)).toEqual(ids);
    const fiveEra = { ...twelve, story_tiers: { gold: original.map(({ id }) => id) } };
    // A list saved before the catalog grew stays explicit, so new stories are not allowed until chosen.
    expect(ceremonyTierStories({ ...fiveEra, stories: fiveEra.stories.map(story => ({ ...story, enabled: true })) }, "gold").filter(story => story.enabled).map(story => story.id)).toEqual(original.map(({ id }) => id));
    const allowed = ceremonyToggleTierStory(fiveEra, fiveEra, "gold", "great_sequoia_wakes", true);
    expect(allowed.gold).toEqual([...original.map(({ id }) => id), "great_sequoia_wakes"]);
    // Narrowing a default-all tier pins today's twelve stories minus the unchecked one.
    expect(ceremonyToggleTierStory(twelve, twelve, "diamond", "sample_story", false).diamond).toEqual(ids.slice(1));
    expect(ceremonyInputIssue({ ...twelve, story_tiers: { diamond: ["parliament_of_owls", "great_sequoia_wakes"], silver: [] } })).toBeNull();
    expect(ceremonyInputIssue({ ...twelve, story_tiers: { diamond: ["missing_story"] } })).toContain("installed animations");
  });
  it("sends every story in the save body, including untouched new ones", () => {
    const { state } = ceremonyState(structuredClone(response));
    expect(state.catalog.map(item => item.recommended_tiers ?? [])).toEqual([...Array(5).fill([]), ...Array(7).fill(["diamond", "obsidian"])]);
    const draft = structuredClone(state.settings);
    const owls = draft.stories.find(story => story.id === "parliament_of_owls")!;
    owls.enabled = true; owls.weight = 15;
    draft.story_tiers = ceremonyToggleTierStory(draft, state.settings, "diamond", "sample_story", false);
    const body = ceremonySaveBody(draft, true, true, true, true, true, true);
    expect(body.stories.map(story => story.id)).toEqual(ids);
    expect(body.stories.find(story => story.id === "parliament_of_owls")).toEqual({ id: "parliament_of_owls", enabled: true, weight: 15 });
    expect(body.stories.filter(story => story.id !== "parliament_of_owls" && added.includes(story.id)).every(story => !story.enabled && story.weight === 0)).toBe(true);
    expect(body.story_tiers?.diamond).toEqual(ids.slice(1));
  });
  it("orders visible rows by the catalog and keeps unlisted saved rows out of view", () => {
    const stored = [{ id: "retired_story", enabled: true, weight: 5 }, ...[...twelve.stories].reverse()];
    expect(ceremonyCatalogRows(stored, catalog).map(story => story.id)).toEqual(ids);
    expect(ceremonyCatalogRows(twelve.stories.slice(0, 5), catalog).map(story => story.id)).toEqual(original.map(({ id }) => id));
    const rows = ceremonyCatalogRows(stored, catalog);
    expect(rows[0]).toBe(stored.find(story => story.id === "sample_story"));
  });
  it("words suggested tiers with tier labels and hides an empty or absent list", () => {
    expect(ceremonySuggestedTiers({ recommended_tiers: ["diamond", "obsidian"] })).toBe("Suggested for Diamond, Obsidian");
    expect(ceremonySuggestedTiers({ recommended_tiers: ["mythril"] })).toBe("Suggested for Mythril");
    expect(ceremonySuggestedTiers({ recommended_tiers: ["badge", "future_tier", "badge"] })).toBe("Suggested for Badge, Future Tier");
    expect(ceremonySuggestedTiers({ recommended_tiers: [] })).toBeNull();
    expect(ceremonySuggestedTiers({})).toBeNull();
    expect(ceremonySuggestedTiers({ recommended_tiers: [3, ""] as never })).toBeNull();
    expect(ceremonySuggestedTiers({ recommended_tiers: "diamond" as never })).toBeNull();
  });
});

describe("ceremony screen films and crash words", () => {
  // Fictional film ids and labels.
  const films: CeremonyFilm[] = [{ id: "storm", label: "Stormy sea" }, { id: "comedy", label: "Silent comedy" }, { id: "meadow", label: "Meadow" }];
  const response = (screen?: CeremonySettings["screen"]): CeremonyResponse => {
    const { screen: _screen, ...older } = settings;
    return { settings: screen ? { ...older, screen } : older, catalog: [], films, ready: true, effective_chances: [],
      effective_scene: { season: "normal", ambiance: "dusk" }, viewer: { display_name: "FictionalMember" } };
  };

  it("reads an older server as the storm default and never sends the screen back to it", () => {
    const { state, screenSupported } = ceremonyState(response());
    expect(screenSupported).toBe(false);
    expect(state.settings.screen).toEqual(SCREEN_DEFAULT);
    expect(ceremonySaveBody(state.settings, true, true, true, true, true, false)).not.toHaveProperty("screen");
  });

  it("keeps a saved random policy and edited words, and sends them to a current server", () => {
    const screen = { film: { mode: "random" as const, weights: { storm: 0, comedy: 3, meadow: 1 } }, error: { title: "Popcorn jam", body: "Sticky.", code: "" } };
    const { state, screenSupported } = ceremonyState(response(screen));
    expect(screenSupported).toBe(true);
    expect(ceremonySaveBody(state.settings, true, true, true, true, true, true).screen).toEqual(screen);
    expect(ceremonyFilmChances(screen.film, films)).toEqual(new Map([["storm", 0], ["comedy", 75], ["meadow", 25]]));
    expect(ceremonyPreviewFilm(screen.film, ["storm", "comedy", "meadow"])).toBe("comedy");
    expect(ceremonyPreviewFilm(screen.film, ["storm", "meadow"])).toBe("meadow");
    expect(ceremonyPreviewFilm(screen.film, [])).toBeNull();
  });

  it("keeps the choice when switching between one film and weighted random", () => {
    const random = ceremonyFilmMode({ mode: "fixed", film: "meadow" }, "random", films);
    expect(random).toEqual({ mode: "random", weights: { storm: 0, comedy: 0, meadow: 1 } });
    expect(ceremonyFilmMode({ mode: "random", weights: { storm: 1, comedy: 4 } }, "fixed", films)).toEqual({ mode: "fixed", film: "comedy" });
    expect(ceremonyFilmMode({ mode: "random", weights: {} }, "fixed", films)).toEqual({ mode: "fixed", film: "storm" });
  });

  it("checks film ids, weights and the crash words before save", () => {
    expect(ceremonyScreenIssue(SCREEN_DEFAULT, films)).toBeNull();
    expect(ceremonyScreenIssue({ ...SCREEN_DEFAULT, film: { mode: "fixed", film: "cartoon" } }, films)).toBe("Choose an installed film.");
    expect(ceremonyScreenIssue({ ...SCREEN_DEFAULT, film: { mode: "random", weights: { storm: 0 } } }, films)).toContain("above zero");
    expect(ceremonyScreenIssue({ ...SCREEN_DEFAULT, film: { mode: "random", weights: { storm: 1001 } } }, films)).toContain("0 to 1000");
    expect(ceremonyScreenIssue({ ...SCREEN_DEFAULT, film: { mode: "random", weights: { storm: Number.NaN } } }, films)).toContain("0 to 1000");
    expect(ceremonyScreenIssue({ ...SCREEN_DEFAULT, film: { mode: "random", weights: { cartoon: 2 } } }, films)).toContain("no longer installed");
    const words = (title: string, body: string, code: string) => ({ title, body, code });
    expect(ceremonyCrashTextIssues(words("Oops", "Popcorn in the projector", ""))).toBeNull();
    expect(ceremonyCrashTextIssues(words("", "Popcorn", ""))).toHaveProperty("title");
    expect(ceremonyCrashTextIssues(words(" Oops", "Popcorn", ""))).toHaveProperty("title");
    expect(ceremonyCrashTextIssues(words("Oops", "a\nb", ""))).toHaveProperty("body");
    expect(ceremonyCrashTextIssues(words("Oops", "b".repeat(111), ""))).toHaveProperty("body");
    expect(ceremonyCrashTextIssues(words("Oops", "Popcorn", "C".repeat(33)))).toHaveProperty("code");
    expect(ceremonyCrashTextIssues(words("O".repeat(12), "Popcorn", ""), { title: 10, body: 120, code: 40 })).toHaveProperty("title");
    expect(ceremonyScreenIssue({ ...SCREEN_DEFAULT, error: words("", "b", "") }, films)).toBe("Check the crash screen words.");
  });

  it("previews a film and unsaved words without changing the key of a plain story", () => {
    const sample = { kind: "raid" as const, raid: "TNA", tier: "gold", count: 100 };
    const scene = { season: "normal" as const, ambiance: "dusk" as const };
    expect(ceremonyPreviewKey("sample_story", sample, scene)).toBe(ceremonyPreviewKey("sample_story", sample, scene, { film: null, error: null, payload: "award" }));
    const storm = ceremonyPreviewKey("sample_story", sample, scene, { film: "storm", error: null, payload: "award" });
    expect(ceremonyPreviewKey("sample_story", sample, scene, { film: "comedy", error: null, payload: "award" })).not.toBe(storm);
    expect(ceremonyPreviewKey("sample_story", sample, scene, { film: "storm", error: SCREEN_DEFAULT.error, payload: "award" })).not.toBe(storm);
    expect(ceremonyPreviewKey("sample_story", sample, scene, { film: "storm", error: null, payload: "welcome" })).not.toBe(storm);
    expect(ceremonyScreeningBody({ film: null, error: null, payload: "award" })).toEqual({});
    expect(ceremonyScreeningBody({ film: "comedy", error: SCREEN_DEFAULT.error, payload: "welcome" })).toEqual({ film: "comedy", error: SCREEN_DEFAULT.error, payload: "welcome" });
  });

  it("ignores malformed film entries", () => {
    expect(ceremonyFilms({ films: [{ id: "storm", label: "Stormy sea" }, { id: "", label: "Blank" }, { label: "No id" } as unknown as CeremonyFilm] })).toEqual([{ id: "storm", label: "Stormy sea" }]);
    expect(ceremonyFilms({})).toEqual([]);
  });
});
