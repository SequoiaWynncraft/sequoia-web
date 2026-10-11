import { REPEAT_DEFAULT, repeatIssue, type RepeatPenalty } from "./repeat";

export type WelcomeSeason = "normal" | "winter";
export type WelcomeFont = "minecraft" | "jersey_15" | "pixelify_sans";
export type WelcomeSkyEffect = "aurora";
export type WelcomePreviewEffect = "none" | WelcomeSkyEffect;
export interface WelcomeMessage {
  headline: string;
  subtitle: string;
  font: WelcomeFont;
}
/** Time of day is its own mode, independent of season, motif and sky effect. */
export interface WelcomeNight {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
  moon: boolean;
}
export interface WelcomeSettings {
  version: number;
  guild_id: string;
  enabled: boolean;
  channel_id: string;
  season_mode: "automatic" | WelcomeSeason;
  winter_start: { month: number; day: number };
  winter_end: { month: number; day: number };
  variants: { id: string; enabled: boolean; weight: number }[];
  links: { label: string; url: string }[];
  message: WelcomeMessage;
  name_font: WelcomeFont;
  effects: { sky: { id: WelcomeSkyEffect; percent: number }[] };
  night: WelcomeNight;
  /** Ping the new member in the welcome post. */
  mention_member: boolean;
  /** Attach the welcome image. Off sends a text-only post. */
  send_images: boolean;
  repeat: RepeatPenalty;
}
export interface WelcomeState {
  settings: WelcomeSettings;
  catalog: { id: string; label: string; description: string; normal_ready: boolean; winter_ready: boolean }[];
  effective_season: WelcomeSeason;
  effective_chances: { id: string; percent: number }[];
  ready: boolean;
  viewer: { display_name: string };
  fonts: { id: WelcomeFont; label: string }[];
  effects: { sky: { id: WelcomeSkyEffect; label: string; description: string; normal_ready: boolean; winter_ready: boolean }[] };
  effective_effect_chances: { sky: { id: WelcomePreviewEffect; percent: number }[] };
  effective_night: { active: boolean; scheduled: boolean; local_time: string | null; timezone: string; ready: boolean; timezones: string[] };
  /** Last live picks, most recent first. Absent on servers without repeat penalties. */
  recent_events?: string[];
  /** Next live pick odds after the repeat penalty. Absent on servers without repeat penalties. */
  current_chances?: { id: string; percent: number }[];
}
/** Wire shape. Servers from before night scheduling omit both night fields; older servers omit mention_member, send_images and repeat. */
export type WelcomeResponse = Omit<WelcomeState, "settings" | "effective_night"> & {
  settings: Omit<WelcomeSettings, "night" | "mention_member" | "send_images" | "repeat"> & { night?: WelcomeNight; mention_member?: boolean; send_images?: boolean; repeat?: RepeatPenalty };
  effective_night?: WelcomeState["effective_night"];
};
export const WELCOME_NIGHT_DEFAULT: WelcomeNight = { enabled: false, start: "21:00", end: "07:00", timezone: "UTC", moon: false };

/** Fills the night, mention, images and repeat defaults for older servers. Unsupported fields are never sent back to them. */
export function welcomeStateWithNight(response: WelcomeResponse): { state: WelcomeState; nightSupported: boolean; mentionSupported: boolean; imagesSupported: boolean; repeatSupported: boolean } {
  const nightSupported = response.settings.night !== undefined && response.effective_night !== undefined;
  const mentionSupported = typeof response.settings.mention_member === "boolean";
  return {
    nightSupported,
    mentionSupported,
    imagesSupported: typeof response.settings.send_images === "boolean",
    repeatSupported: response.settings.repeat !== undefined,
    state: {
      ...response,
      settings: {
        ...response.settings,
        night: response.settings.night ?? { ...WELCOME_NIGHT_DEFAULT },
        mention_member: response.settings.mention_member === true,
        // Servers that omit the field always attach images, so it reads as on.
        send_images: response.settings.send_images !== false,
        repeat: response.settings.repeat ?? { ...REPEAT_DEFAULT },
      },
      effective_night: response.effective_night ?? { active: false, scheduled: false, local_time: null, timezone: "UTC", ready: false, timezones: [] },
    },
  };
}

/** Full settings definition for save. Older servers reject the unknown night, mention_member, send_images and repeat fields. */
export function welcomeSaveBody(
  settings: WelcomeSettings,
  nightSupported: boolean,
  mentionSupported: boolean,
  repeatSupported: boolean,
  imagesSupported: boolean,
): Omit<WelcomeSettings, "night" | "mention_member" | "send_images" | "repeat"> & Partial<Pick<WelcomeSettings, "night" | "mention_member" | "send_images" | "repeat">> {
  const { night, mention_member, send_images, repeat, ...body } = settings;
  return {
    ...body,
    ...(nightSupported ? { night } : {}),
    ...(mentionSupported ? { mention_member } : {}),
    ...(imagesSupported ? { send_images } : {}),
    ...(repeatSupported ? { repeat } : {}),
  };
}

/** Unsaved edits, including unsupported fields that are never sent. */
export function welcomeSettingsDirty(draft: WelcomeSettings, saved: WelcomeSettings): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved);
}

/** Explicit preview scene overrides. Absent fields follow the saved schedule and moon setting. */
export interface WelcomePreviewScene {
  night?: boolean;
  moon?: boolean;
}

/** Pin the saved-state server scene across stills, playback and retries until settings refresh. */
export function welcomePreviewScene(nightSupported: boolean, snapshot: { active: boolean; moon: boolean }, time: "scheduled" | "day" | "night", moon: "saved" | "shown" | "hidden"): WelcomePreviewScene {
  if (!nightSupported) return {};
  return {
    night: time === "scheduled" ? snapshot.active : time === "night",
    moon: time === "day" ? undefined : moon === "saved" ? snapshot.moon : moon === "shown",
  };
}

/** The server remains the authority for glyph support and visible text fit. */
export function welcomeMessageIssue(message: WelcomeMessage): string | null {
  for (const [label, text] of [["Headline", message.headline], ["Subtitle", message.subtitle]]) {
    if (!text.trim()) return `Enter a ${label.toLowerCase()}.`;
    if (Array.from(text).length > 64) return `${label} must be 64 characters or fewer.`;
    if (/[\u0000-\u001f\u007f-\u009f]/.test(text)) return `${label} must be a single line without control characters.`;
  }
  return null;
}

/** PNG stills and GIF playback must refer to exactly the same unsaved draft. */
export function welcomePreviewKey(variantId: string, season: WelcomeSeason, name: string, message: WelcomeMessage, effect: WelcomePreviewEffect = "none", nameFont: WelcomeFont = "minecraft", scene: WelcomePreviewScene & { saved?: WelcomeNight } = {}): string {
  // A scene that follows the saved schedule or moon changes whenever that saved setting changes.
  const follows = scene.night === undefined || scene.moon === undefined ? scene.saved ?? null : null;
  return JSON.stringify([variantId, season, name, message.headline, message.subtitle, message.font, effect, nameFont, scene.night ?? null, scene.moon ?? null, follows]);
}

const NIGHT_TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Mirrors the Rust schedule rules. Rust remains the timezone and boundary authority. */
export function welcomeNightIssue(night: WelcomeNight, timezones: readonly string[]): { start?: string; end?: string; timezone?: string } | null {
  const issue: { start?: string; end?: string; timezone?: string } = {};
  if (!NIGHT_TIME.test(night.start)) issue.start = "Use a 24-hour time such as 21:00.";
  if (!NIGHT_TIME.test(night.end)) issue.end = "Use a 24-hour time such as 07:00.";
  else if (night.start === night.end) issue.end = "Night must end at a different time than it starts.";
  if (!night.timezone.trim()) issue.timezone = "Enter a timezone such as Europe/Stockholm.";
  else if (!timezones.includes(night.timezone)) issue.timezone = "Choose a timezone from the list, such as Europe/Stockholm.";
  return Object.keys(issue).length ? issue : null;
}

/** Plain-language active interval, or null while the schedule is incomplete. */
export function welcomeNightSummary(night: Pick<WelcomeNight, "start" | "end" | "timezone">): string | null {
  if (!NIGHT_TIME.test(night.start) || !NIGHT_TIME.test(night.end) || night.start === night.end || !night.timezone.trim()) return null;
  return `Night from ${night.start} to ${night.end} (${night.timezone})${night.start > night.end ? ", crossing midnight" : ""}`;
}

/** Turning night on, or changing an enabled schedule, needs verified night artwork. Turning it off never does. */
export function welcomeNightReadinessIssue(draft: WelcomeNight, saved: WelcomeNight, ready: boolean): string | null {
  if (ready || !draft.enabled || JSON.stringify(draft) === JSON.stringify(saved)) return null;
  return "Night artwork is not installed yet. Turn off night to save other changes.";
}

export function welcomeSkyEffectIssue(sky: WelcomeSettings["effects"]["sky"]): string | null {
  if (sky.some(({ percent }) => !Number.isInteger(percent) || percent < 0 || percent > 100)) return "Use whole-number sky effect percentages from 0 to 100.";
  if (sky.reduce((sum, { percent }) => sum + percent, 0) > 100) return "Sky effect percentages must total 100 or less.";
  return null;
}

/** Display-only draft chances. Unavailable effects fall back to no effect; Rust owns delivery. */
export function welcomeSkyChances(sky: WelcomeSettings["effects"]["sky"], catalog: WelcomeState["effects"]["sky"]): Map<WelcomePreviewEffect, number> | null {
  if (welcomeSkyEffectIssue(sky)) return null;
  const chances = new Map<WelcomePreviewEffect, number>();
  let total = 0;
  for (const { id, percent } of sky) {
    const effect = catalog.find((entry) => entry.id === id);
    const eligible = effect?.normal_ready && effect.winter_ready ? percent : 0;
    chances.set(id, eligible);
    total += eligible;
  }
  chances.set("none", 100 - total);
  return chances;
}

/** Only copy or font changes remove the previous raster while its replacement loads. */
export function welcomePreviewMessageChanged(previous: WelcomeMessage, next: WelcomeMessage): boolean {
  return previous.headline !== next.headline || previous.subtitle !== next.subtitle || previous.font !== next.font;
}

/** Draft display guard only. Rust still verifies permissions and actual artwork readiness on save. */
export function welcomeReadinessIssue(settings: WelcomeSettings, catalog: WelcomeState["catalog"]): string | null {
  if (!/^[1-9][0-9]*$/.test(settings.channel_id) || BigInt(settings.channel_id) > 18446744073709551615n) return "Choose a valid channel before turning welcomes on.";
  if (settings.variants.some(({ weight }) => !Number.isInteger(weight) || weight < 0 || weight > 1000)) return "Use whole-number weights from 0 to 1000.";
  const eligible = settings.variants.filter(({ enabled, weight }) => enabled && weight > 0);
  if (eligible.length === 0) return "Enable at least one welcome with a positive weight.";
  if (eligible.some(({ id }) => {
    const item = catalog.find((entry) => entry.id === id);
    return !item?.normal_ready || !item.winter_ready;
  })) return "Enabled welcomes need normal and winter artwork. Turn off pending ones or set their weight to 0.";
  return null;
}

/** Only local input completeness. Rust remains the date, odds and destination authority. Null timezones means the server has no night schedule. */
export function welcomeInputIssue(settings: WelcomeSettings, timezones: readonly string[] | null): string | null {
  const messageIssue = welcomeMessageIssue(settings.message);
  if (messageIssue) return messageIssue;
  const nightIssue = timezones && welcomeNightIssue(settings.night, timezones);
  if (nightIssue) return `Night: ${nightIssue.start ?? nightIssue.end ?? nightIssue.timezone}`;
  const effectIssue = welcomeSkyEffectIssue(settings.effects.sky);
  if (effectIssue) return effectIssue;
  const repeat = repeatIssue(settings.repeat);
  if (repeat) return repeat;
  if (settings.enabled && !settings.channel_id.trim()) return "Choose a destination channel.";
  const dates = [settings.winter_start, settings.winter_end];
  if (dates.some(({ month, day }) => !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31)) return "Enter a month from 1 to 12 and a day from 1 to 31.";
  if (settings.variants.some(({ weight }) => !Number.isInteger(weight) || weight < 0 || weight > 1000)) return "Use whole-number weights from 0 to 1000.";
  if (!settings.variants.some(({ enabled, weight }) => enabled && weight > 0)) return "Enable at least one welcome with a positive weight.";
  if (settings.links.length > 5) return "Use at most five welcome links.";
  if (settings.links.some(({ label, url }) => !label.trim() || !url.trim())) return "Give each welcome link a label and URL, or remove it.";
  return null;
}

export function welcomeChance(percent: number | undefined): string {
  if (percent === undefined || !Number.isFinite(percent)) return "n/a";
  if (percent === 0) return "0%";
  if (percent < 0.1) return "<0.1%";
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(percent)}%`;
}
