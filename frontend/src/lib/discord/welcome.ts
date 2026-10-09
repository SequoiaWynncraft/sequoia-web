export type WelcomeSeason = "normal" | "winter";
export type WelcomeFont = "minecraft" | "jersey_15" | "pixelify_sans";
export type WelcomeSkyEffect = "aurora";
export type WelcomePreviewEffect = "none" | WelcomeSkyEffect;
export interface WelcomeMessage {
  headline: string;
  subtitle: string;
  font: WelcomeFont;
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
  effects: { sky: { id: WelcomeSkyEffect; percent: number }[] };
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
}

/** The renderer remains the authority for glyph support and visible text fit. */
export function welcomeMessageIssue(message: WelcomeMessage): string | null {
  for (const [label, text] of [["Headline", message.headline], ["Subtitle", message.subtitle]]) {
    if (!text.trim()) return `Enter a ${label.toLowerCase()}.`;
    if (Array.from(text).length > 64) return `${label} must be 64 characters or fewer.`;
    if (/[\u0000-\u001f\u007f-\u009f]/.test(text)) return `${label} must be a single line without control characters.`;
  }
  return null;
}

/** PNG stills and GIF playback must refer to exactly the same unsaved draft. */
export function welcomePreviewKey(variantId: string, season: WelcomeSeason, name: string, message: WelcomeMessage, effect: WelcomePreviewEffect = "none"): string {
  return JSON.stringify([variantId, season, name, message.headline, message.subtitle, message.font, effect]);
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

/** Draft display guard only. Rust still verifies permissions and actual renderer readiness on save. */
export function welcomeReadinessIssue(settings: WelcomeSettings, catalog: WelcomeState["catalog"]): string | null {
  if (!/^[1-9][0-9]*$/.test(settings.channel_id) || BigInt(settings.channel_id) > 18446744073709551615n) return "Choose a valid destination channel before enabling welcomes.";
  if (settings.variants.some(({ weight }) => !Number.isInteger(weight) || weight < 0 || weight > 1000)) return "Use whole-number weights from 0 to 1000 before enabling welcomes.";
  const eligible = settings.variants.filter(({ enabled, weight }) => enabled && weight > 0);
  if (eligible.length === 0) return "Enable at least one welcome with a positive weight.";
  if (eligible.some(({ id }) => {
    const item = catalog.find((entry) => entry.id === id);
    return !item?.normal_ready || !item.winter_ready;
  })) return "Enabled welcomes need normal and winter artwork. Disable pending variants or set their weight to zero.";
  return null;
}

/** Only local input completeness. Rust remains the date, odds and destination authority. */
export function welcomeInputIssue(settings: WelcomeSettings): string | null {
  const messageIssue = welcomeMessageIssue(settings.message);
  if (messageIssue) return messageIssue;
  const effectIssue = welcomeSkyEffectIssue(settings.effects.sky);
  if (effectIssue) return effectIssue;
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
