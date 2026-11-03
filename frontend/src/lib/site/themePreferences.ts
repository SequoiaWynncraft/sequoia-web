import { CONFIGURED_DEFAULT_THEME } from "#lib/config/public.js";

export const THEME_COOKIE = "seq_theme";

export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

export interface Theme {
  id: string;
  label: string;
  description: string;
  /** Homepage hero art, a filename under `static/assets/images/`. */
  heroImage: string;
  /** Not offered to visitors yet; still usable as the configured default. */
  hidden?: boolean;
}

export const THEMES: readonly Theme[] = [
  {
    id: "gaz-purple",
    label: "Tna purple (classic)",
    description:
      "The original Sequoia look: near-black forest surfaces, enchanted gold, and Fruma at dusk.",
    heroImage: "fruma_banner.avif",
  },
  {
    id: "autumn",
    label: "Autumn",
    description:
      "Sunlit amber under a red maple canopy: warm umber surfaces, maple terracotta, and a misty horizon.",
    heroImage: "autumn_banner.avif",
    hidden: true,
  },
];

export const FALLBACK_THEME_ID = "gaz-purple";

export const DEFAULT_THEME_ID = THEMES.some((theme) => theme.id === CONFIGURED_DEFAULT_THEME)
  ? CONFIGURED_DEFAULT_THEME
  : FALLBACK_THEME_ID;

export const SELECTABLE_THEMES: readonly Theme[] = THEMES.filter(
  (theme) => !theme.hidden || theme.id === DEFAULT_THEME_ID,
);

/**
 * Read the cookie into a theme id. An unknown value - a forged cookie, or a
 * theme that has since been retired or hidden - falls back to the default.
 */
export function parseThemeId(raw: string | null | undefined): string {
  const id = raw?.trim();
  return SELECTABLE_THEMES.some((theme) => theme.id === id) ? (id as string) : DEFAULT_THEME_ID;
}

/** The theme for an id, falling back to the default so callers never handle a miss. */
export function themeById(id: string | null | undefined): Theme {
  const wanted = parseThemeId(id);
  return (
    THEMES.find((theme) => theme.id === wanted) ??
    (THEMES.find((theme) => theme.id === FALLBACK_THEME_ID) as Theme)
  );
}
