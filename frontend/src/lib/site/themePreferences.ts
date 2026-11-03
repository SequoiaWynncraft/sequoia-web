/**
 * The site's visual themes: the homepage hero art and the colour palette that
 * goes with it. A theme is a display preference, so like the navbar choice it
 * lives in a cookie on the browser rather than on the account - a signed-out
 * visitor gets to pick one too.
 *
 * The default is `PUBLIC_DEFAULT_THEME` when it names a registered theme, and
 * `FALLBACK_THEME_ID` otherwise. A theme marked `hidden` stays registered but
 * is neither offered in settings nor accepted from a cookie - unless it is the
 * configured default, so the env var can switch to it ahead of unhiding it.
 *
 * Adding a theme is two edits: an entry in `THEMES` here, and a matching
 * `:root[data-theme="<id>"]` override block in
 * `$lib/design-system/tokens/colors.css`. Nothing else should need touching -
 * every palette colour in the app resolves through the tokens that block
 * overrides. Autumn is the exception: its palette is the bare `:root` block
 * there, so it has no override block of its own.
 */

import { CONFIGURED_DEFAULT_THEME } from "$lib/config/public";

/**
 * Cookie holding this browser's theme. Read in the root layout load so page
 * data carries it, and again in `hooks.server.ts` so the chosen palette is
 * stamped on `<html>` before the first byte of CSS applies.
 */
export const THEME_COOKIE = "seq_theme";

/** A year, matching the navbar preference, so the choice survives ordinary browsing. */
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

/** One selectable look: its palette block and the hero art that belongs to it. */
export interface Theme {
  /** Cookie value, and the `data-theme` attribute the palette keys off. */
  id: string;
  label: string;
  description: string;
  /** Homepage hero art, a filename under `static/assets/images/`. */
  heroImage: string;
  /**
   * Size the hero to the art's 16:9 shape, so a normal desktop window shows the
   * whole image (the page scrolls a little further) instead of cropping it to the
   * viewport. Narrow screens still crop the sides.
   */
  heroFullImage?: boolean;
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
    id: "winter",
    label: "Winter",
    description: "A snowy night around a lantern-strung tree, in the classic Tna purple palette.",
    heroImage: "winter_banner.avif",
    heroFullImage: true,
  },
  {
    id: "autumn",
    label: "Autumn",
    description:
      "Sunlit amber under a red maple canopy: warm umber surfaces, maple terracotta, and a misty horizon.",
    heroImage: "autumn_banner.avif",
    // Hidden until the final hero art lands.
    hidden: true,
  },
];

/** The default when `PUBLIC_DEFAULT_THEME` is unset or names no registered theme. */
export const FALLBACK_THEME_ID = "winter";

/** Applied when nobody has chosen, and whenever a stored choice is no longer selectable. */
export const DEFAULT_THEME_ID = THEMES.some((theme) => theme.id === CONFIGURED_DEFAULT_THEME)
  ? CONFIGURED_DEFAULT_THEME
  : FALLBACK_THEME_ID;

/** The themes a visitor may pick: every visible one, plus the default even if hidden. */
export const SELECTABLE_THEMES: readonly Theme[] = THEMES.filter(
  (theme) => !theme.hidden || theme.id === DEFAULT_THEME_ID,
);

/**
 * Read the cookie into a theme id. An unknown value - a forged cookie, or a
 * theme that has since been retired or hidden - falls back to the default rather than
 * reaching the page as a `data-theme` that matches no palette.
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
