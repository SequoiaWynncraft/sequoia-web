import { REPEAT_DEFAULT, repeatIssue, type RepeatPenalty } from "./repeat";

export type CeremonySeason = "normal" | "winter";
export type CeremonyAmbiance = "dusk" | "night";
export type CeremonyTier = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "obsidian" | "mythril";
export type CeremonyRaid = "NOTG" | "TNA" | "TCC" | "NOL" | "TWP";
/** Preview-only scene choice. Scheduled pins the scene in the last server settings response. */
export type CeremonySceneChoice = "scheduled" | "normal-dusk" | "normal-night" | "winter-dusk" | "winter-night";

export type ImageTier = CeremonyTier | "badge";
/** Per-tier image choice. An award attaches an image only when send_images and its tier are both on. */
export type ImageTiers = Record<ImageTier, boolean>;
/** Missing tiers allow all stories; an explicit empty list sends text only. */
export type StoryTiers = Partial<Record<ImageTier, string[]>>;
export const IMAGE_TIERS_DEFAULT: Readonly<ImageTiers> = {
  bronze: false, silver: false, gold: true, platinum: true, diamond: true, obsidian: true, mythril: true, badge: true,
};

export interface CeremonySettings {
  version: number;
  guild_id: string;
  enabled: boolean;
  channel_id: string;
  stories: { id: string; enabled: boolean; weight: number }[];
  /** Ping the player's linked Discord account. */
  mention_member: boolean;
  /** Attach the ceremony image. Off sends a text-only post. */
  send_images: boolean;
  image_tiers: ImageTiers;
  story_tiers: StoryTiers;
  repeat: RepeatPenalty;
}
export interface CeremonyScene {
  season: CeremonySeason;
  ambiance: CeremonyAmbiance;
}
/** Wire shape. Older servers omit mention_member, send_images and image_tiers; servers without repeat penalties omit repeat, recent_events and current_chances. */
export interface CeremonyResponse {
  settings: Omit<CeremonySettings, "mention_member" | "send_images" | "image_tiers" | "story_tiers" | "repeat"> & { mention_member?: boolean; send_images?: boolean; image_tiers?: Partial<ImageTiers>; story_tiers?: StoryTiers; repeat?: RepeatPenalty };
  catalog: { id: string; label: string; description: string; layout: string; ready: boolean }[];
  ready: boolean;
  effective_chances: { id: string; percent: number }[];
  effective_scene: CeremonyScene;
  viewer: { display_name: string };
  /** Previewable achievement categories. Absent on older servers, which only preview raids. */
  achievement_catalog?: CeremonyCategory[];
  /** Last live picks, most recent first. */
  recent_events?: string[];
  /** Next live pick odds after the repeat penalty. */
  current_chances?: { id: string; percent: number }[];
  current_chances_by_tier?: Partial<Record<ImageTier, { id: string; percent: number }[]>>;
}
/** Loaded state with every settings field present. */
export type CeremonyState = Omit<CeremonyResponse, "settings"> & { settings: CeremonySettings };

/** Fills the mention, images, image tier and repeat defaults for older servers. Unsupported fields are never sent back to them. */
export function ceremonyState(response: CeremonyResponse): { state: CeremonyState; mentionSupported: boolean; imagesSupported: boolean; imageTiersSupported: boolean; storyTiersSupported: boolean; repeatSupported: boolean } {
  const tiers = response.settings.image_tiers;
  return {
    mentionSupported: typeof response.settings.mention_member === "boolean",
    imagesSupported: typeof response.settings.send_images === "boolean",
    imageTiersSupported: typeof tiers === "object" && tiers !== null,
    storyTiersSupported: typeof response.settings.story_tiers === "object" && response.settings.story_tiers !== null,
    repeatSupported: response.settings.repeat !== undefined,
    state: {
      ...response,
      settings: {
        ...response.settings,
        mention_member: response.settings.mention_member === true,
        // Servers that omit the field always attach images, so it reads as on.
        send_images: response.settings.send_images !== false,
        image_tiers: { ...IMAGE_TIERS_DEFAULT, ...(typeof tiers === "object" && tiers !== null ? tiers : {}) },
        story_tiers: structuredClone(response.settings.story_tiers ?? {}),
        repeat: response.settings.repeat ?? { ...REPEAT_DEFAULT },
      },
    },
  };
}

/** Full settings definition for save. Older servers reject the unknown mention_member, send_images, image_tiers and repeat fields. */
export function ceremonySaveBody(
  settings: CeremonySettings,
  mentionSupported: boolean,
  repeatSupported: boolean,
  imagesSupported: boolean,
  imageTiersSupported: boolean,
  storyTiersSupported = false,
): Omit<CeremonySettings, "mention_member" | "send_images" | "image_tiers" | "story_tiers" | "repeat"> & Partial<Pick<CeremonySettings, "mention_member" | "send_images" | "image_tiers" | "story_tiers" | "repeat">> {
  const { mention_member, send_images, image_tiers, story_tiers, repeat, ...body } = settings;
  return {
    ...body,
    ...(mentionSupported ? { mention_member } : {}),
    ...(imagesSupported ? { send_images } : {}),
    ...(imageTiersSupported ? { image_tiers } : {}),
    ...(storyTiersSupported ? { story_tiers } : {}),
    ...(repeatSupported ? { repeat } : {}),
  };
}

/** Whether any award would attach an image. Unsupported fields read as on, matching older servers that always attach images. */
export function ceremonyImagesInUse(settings: Pick<CeremonySettings, "send_images" | "image_tiers"> & Partial<Pick<CeremonySettings, "stories" | "story_tiers">>, imagesSupported: boolean, imageTiersSupported: boolean): boolean {
  return (!imagesSupported || settings.send_images) && IMAGE_TIERS.some(({ id }) =>
    (!imageTiersSupported || settings.image_tiers[id]) && (!settings.stories || settings.stories.some(story =>
      story.enabled && story.weight > 0 && (!settings.story_tiers?.[id] || settings.story_tiers[id]?.includes(story.id)))));
}

export function ceremonyTierStories(settings: Pick<CeremonySettings, "stories" | "story_tiers">, tier: ImageTier): CeremonySettings["stories"] {
  const allowed = settings.story_tiers[tier];
  return settings.stories.map(story => ({ ...story, enabled: story.enabled && (allowed === undefined || allowed.includes(story.id)) }));
}

/** Unsaved edits, including unsupported fields that are never sent. */
export function ceremonySettingsDirty(draft: CeremonySettings, saved: CeremonySettings): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved);
}

export type CeremonyCategory =
  | { kind: "raid"; label: string; raids: string[]; tiers: string[] }
  | { kind: "war"; label: string; tiers: string[] }
  | { kind: "profession"; label: string; professions: string[]; levels: number[] }
  | { kind: "role"; label: string; categories: string[]; tiers: string[] }
  | { kind: "badge"; label: string };
export type CeremonyCategoryKind = CeremonyCategory["kind"];

/** Sample achievement sent with a preview. A null raid is the combined All raids total. */
export type CeremonyAchievement =
  | { kind: "raid"; raid: string | null; tier: string; count: number }
  | { kind: "war"; tier: string; count: number }
  | { kind: "profession"; profession: string; level: number }
  | { kind: "role"; category: string; tier: string; label: string }
  | { kind: "badge"; title: string };

export const CEREMONY_TIERS: readonly { id: CeremonyTier; label: string }[] = [
  { id: "bronze", label: "Bronze" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
  { id: "diamond", label: "Diamond" },
  { id: "obsidian", label: "Obsidian" },
  { id: "mythril", label: "Mythril" },
];
export const IMAGE_TIERS: readonly { id: ImageTier; label: string }[] = [...CEREMONY_TIERS, { id: "badge", label: "Badge" }];
export const CEREMONY_RAIDS: readonly CeremonyRaid[] = ["NOTG", "TNA", "TCC", "NOL", "TWP"];
export const CEREMONY_SCENES: readonly { id: CeremonySceneChoice; label: string }[] = [
  { id: "scheduled", label: "As scheduled" },
  { id: "normal-dusk", label: "Normal dusk" },
  { id: "normal-night", label: "Normal night" },
  { id: "winter-dusk", label: "Snow dusk" },
  { id: "winter-night", label: "Snow night" },
];
/** The compiled base loops are 32 seconds. Playback returns to the still after one loop. */
export const CEREMONY_LOOP_MS = 32_000;
export const CEREMONY_COUNT_MAX = 1_000_000;

/** Readable scene, e.g. "Snow night". */
export function ceremonySceneLabel(scene: CeremonyScene): string {
  return `${scene.season === "winter" ? "Snow" : "Normal"} ${scene.ambiance}`;
}

/** Explicit preview scene. Scheduled sends the last loaded server scene so stills and playback match. */
export function ceremonyPreviewScene(choice: CeremonySceneChoice, scheduled: CeremonyScene): CeremonyScene {
  if (choice === "scheduled") return { ...scheduled };
  const [season, ambiance] = choice.split("-") as [CeremonySeason, CeremonyAmbiance];
  return { season, ambiance };
}

export function ceremonyWeightIssue(stories: CeremonySettings["stories"]): string | null {
  if (stories.some(({ weight }) => !Number.isInteger(weight) || weight < 0 || weight > 1000)) return "Use whole-number weights from 0 to 1000.";
  return null;
}

function validSnowflake(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value) && BigInt(value) <= 18446744073709551615n;
}

/** Local input completeness only. Rust remains the destination, odds and readiness authority. */
export function ceremonyInputIssue(settings: CeremonySettings): string | null {
  const weights = ceremonyWeightIssue(settings.stories);
  if (weights) return weights;
  const ids = new Set(settings.stories.map(story => story.id));
  if (Object.entries(settings.story_tiers).some(([tier, allowed]) => !IMAGE_TIERS.some(item => item.id === tier)
    || !Array.isArray(allowed) || new Set(allowed).size !== allowed.length || allowed.some(id => !ids.has(id)))) return "Choose installed animations for each tier.";
  const repeat = repeatIssue(settings.repeat);
  if (repeat) return repeat;
  if (settings.enabled && !settings.channel_id.trim()) return "Choose a destination channel.";
  if (settings.channel_id.trim() && !validSnowflake(settings.channel_id.trim())) return "Choose a valid destination channel.";
  return null;
}

/** Draft display guard for enabling. Rust still verifies artwork, channel permissions and odds on save. Text-only delivery needs no artwork. */
export function ceremonyReadinessIssue(settings: CeremonySettings, ready: boolean, sendImages = ceremonyImagesInUse(settings, true, true)): string | null {
  if (sendImages && !ready) return "Ceremony artwork is not installed yet, so ceremonies stay off.";
  if (!validSnowflake(settings.channel_id)) return "Choose a valid channel before turning ceremonies on.";
  if (ceremonyWeightIssue(settings.stories)) return "Use whole-number weights from 0 to 1000.";
  if (!settings.stories.some(({ enabled, weight }) => enabled && weight > 0)) return "Enable at least one story with a positive weight.";
  return null;
}

/** Display-only proposed shares over enabled weights. Null while the draft cannot produce odds. */
export function ceremonyProposedChances(stories: CeremonySettings["stories"]): Map<string, number> | null {
  if (ceremonyWeightIssue(stories)) return null;
  const total = stories.reduce((sum, item) => sum + (item.enabled ? item.weight : 0), 0);
  if (total === 0) return null;
  return new Map(stories.map((item) => [item.id, item.enabled ? item.weight * 100 / total : 0]));
}

export function ceremonyCountIssue(count: number | null | undefined): string | null {
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > CEREMONY_COUNT_MAX) return "Use a whole number from 1 to 1,000,000.";
  return null;
}

export const CEREMONY_BADGE_TITLE_MAX = 64;
/** The raid list entry that stands for the combined total. */
export const CEREMONY_ALL_RAIDS = "All raids";

export function ceremonyBadgeTitleIssue(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "Enter a badge title.";
  if (trimmed.length > CEREMONY_BADGE_TITLE_MAX) return `Use ${CEREMONY_BADGE_TITLE_MAX} characters or fewer.`;
  return null;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0);
}

/** Usable catalog entries in server order, or null for an older server without a catalog (raid-only previews). */
export function ceremonyCategories(response: Pick<CeremonyResponse, "achievement_catalog">): CeremonyCategory[] | null {
  const catalog: unknown = response.achievement_catalog;
  if (!Array.isArray(catalog)) return null;
  const usable = catalog.filter((entry): entry is CeremonyCategory => {
    if (typeof entry !== "object" || entry === null || typeof entry.label !== "string") return false;
    switch (entry.kind) {
      case "raid": return strings(entry.raids) && strings(entry.tiers);
      case "war": return strings(entry.tiers);
      case "profession": return strings(entry.professions) && Array.isArray(entry.levels) && entry.levels.length > 0
        && entry.levels.every((level: unknown) => typeof level === "number" && Number.isInteger(level) && level > 0);
      case "role": return strings(entry.categories) && strings(entry.tiers);
      case "badge": return true;
      default: return false;
    }
  });
  return usable.length > 0 ? usable : null;
}

/** Readable form of a server key: "war_honour" to "War Honour", "mining" to "Mining". */
export function ceremonyKeyLabel(key: string): string {
  return key.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

/** The role name a role preview announces, e.g. "Gold Insignia". */
export function ceremonyRoleLabel(category: string, tier: string): string {
  return `${ceremonyTierLabel(tier)} ${ceremonyKeyLabel(category)}`;
}

/** Local completeness of the sample achievement. Rust validates the rest. */
export function ceremonyAchievementIssue(achievement: CeremonyAchievement): string | null {
  switch (achievement.kind) {
    case "raid":
    case "war": return ceremonyCountIssue(achievement.count);
    case "badge": return ceremonyBadgeTitleIssue(achievement.title);
    default: return null;
  }
}

/** What the sample announces, for the preview alt text. */
export function ceremonyAchievementDescription(achievement: CeremonyAchievement): string {
  const number = new Intl.NumberFormat("en");
  switch (achievement.kind) {
    case "raid": return `${ceremonyTierLabel(achievement.tier)} with ${number.format(achievement.count)} raids in ${achievement.raid ?? CEREMONY_ALL_RAIDS}`;
    case "war": return `${ceremonyTierLabel(achievement.tier)} with ${number.format(achievement.count)} guild wars`;
    case "profession": return `${ceremonyKeyLabel(achievement.profession)} level ${achievement.level}`;
    case "role": return achievement.label;
    case "badge": return `${achievement.title.trim()} badge`;
  }
}

/**
 * Achievement part of the preview body. Servers with a catalog take `{achievement}`;
 * older servers only understand the raid fields at the top level.
 */
export function ceremonyAchievementBody(achievement: CeremonyAchievement, legacy: boolean):
  { achievement: CeremonyAchievement } | { tier: CeremonyTier; raid: CeremonyRaid | null; count: number } {
  if (legacy && achievement.kind === "raid") {
    return { tier: achievement.tier as CeremonyTier, raid: achievement.raid as CeremonyRaid | null, count: achievement.count };
  }
  if (achievement.kind === "badge") return { achievement: { kind: "badge", title: achievement.title.trim() } };
  return { achievement };
}

/** PNG stills and GIF playback must refer to exactly the same request. */
export function ceremonyPreviewKey(storyId: string, achievement: CeremonyAchievement, scene: CeremonyScene): string {
  return JSON.stringify([storyId, ceremonyAchievementBody(achievement, false), scene.season, scene.ambiance]);
}

export function ceremonyChance(percent: number | undefined): string {
  if (percent === undefined || !Number.isFinite(percent)) return "n/a";
  if (percent === 0) return "0%";
  if (percent < 0.1) return "<0.1%";
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(percent)}%`;
}

export function ceremonyTierLabel(tier: string): string {
  return CEREMONY_TIERS.find(({ id }) => id === tier)?.label ?? ceremonyKeyLabel(tier);
}
