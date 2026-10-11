export type CeremonySeason = "normal" | "winter";
export type CeremonyAmbiance = "dusk" | "night";
export type CeremonyTier = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "obsidian" | "mythril";
export type CeremonyRaid = "NOTG" | "TNA" | "TCC" | "NOL" | "TWP";
/** Preview-only scene choice. Scheduled pins the scene in the last server settings response. */
export type CeremonySceneChoice = "scheduled" | "normal-dusk" | "normal-night" | "winter-dusk" | "winter-night";

export interface CeremonySettings {
  version: number;
  guild_id: string;
  enabled: boolean;
  channel_id: string;
  stories: { id: string; enabled: boolean; weight: number }[];
}
export interface CeremonyScene {
  season: CeremonySeason;
  ambiance: CeremonyAmbiance;
}
export interface CeremonyResponse {
  settings: CeremonySettings;
  catalog: { id: string; label: string; description: string; layout: string; ready: boolean }[];
  ready: boolean;
  effective_chances: { id: string; percent: number }[];
  effective_scene: CeremonyScene;
  viewer: { display_name: string };
}

export const CEREMONY_TIERS: readonly { id: CeremonyTier; label: string }[] = [
  { id: "bronze", label: "Bronze" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
  { id: "diamond", label: "Diamond" },
  { id: "obsidian", label: "Obsidian" },
  { id: "mythril", label: "Mythril" },
];
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

/** Explicit scene for the renderer. Scheduled sends the last loaded server scene so stills and playback match. */
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
  if (settings.enabled && !settings.channel_id.trim()) return "Choose a destination channel.";
  if (settings.channel_id.trim() && !validSnowflake(settings.channel_id.trim())) return "Choose a valid destination channel.";
  return null;
}

/** Draft display guard for enabling. Rust still verifies the bundle, channel permissions and odds on save. */
export function ceremonyReadinessIssue(settings: CeremonySettings, ready: boolean): string | null {
  if (!ready) return "Ceremony artwork is not installed yet, so ceremonies cannot be enabled.";
  if (!validSnowflake(settings.channel_id)) return "Choose a valid destination channel before enabling ceremonies.";
  if (ceremonyWeightIssue(settings.stories)) return "Use whole-number weights from 0 to 1000 before enabling ceremonies.";
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
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > CEREMONY_COUNT_MAX) return "Enter a whole-number sample count from 1 to 1,000,000.";
  return null;
}

/** PNG stills and GIF playback must refer to exactly the same request. */
export function ceremonyPreviewKey(storyId: string, tier: CeremonyTier, raid: CeremonyRaid | null, count: number, scene: CeremonyScene): string {
  return JSON.stringify([storyId, tier, raid, count, scene.season, scene.ambiance]);
}

export function ceremonyChance(percent: number | undefined): string {
  if (percent === undefined || !Number.isFinite(percent)) return "n/a";
  if (percent === 0) return "0%";
  if (percent < 0.1) return "<0.1%";
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(percent)}%`;
}

export function ceremonyTierLabel(tier: CeremonyTier): string {
  return CEREMONY_TIERS.find(({ id }) => id === tier)?.label ?? tier;
}
