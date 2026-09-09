/**
 * The site's visual themes: the homepage hero art and the colour palette that
 * goes with it. A theme is a display preference, so like the navbar choice it
 * lives in a cookie on the browser rather than on the account - a signed-out
 * visitor gets to pick one too.
 *
 * Adding a theme is two edits: an entry in `THEMES` here, and a matching
 * `:root[data-theme="<id>"]` override block in
 * `$lib/design-system/tokens/colors.css`. Nothing else should need touching -
 * every palette colour in the app resolves through the tokens that block
 * overrides. The default theme is the exception: its palette is the bare
 * `:root` block there, so it has no override block of its own.
 */

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
}

export const THEMES: readonly Theme[] = [
  {
    id: "autumn",
    label: "Autumn (seasonal)",
    description:
      "Sunlit amber under a red maple canopy: warm umber surfaces, maple terracotta, and a misty horizon.",
    heroImage: "autumn_banner.avif",
  },
  {
    id: "gaz-purple",
    label: "Gaz purple (classic)",
    description:
      "The original Sequoia look: near-black forest surfaces, enchanted gold, and Fruma at dusk.",
    heroImage: "fruma_banner.avif",
  },
];

/** Applied when nobody has chosen, and whenever a stored choice no longer exists. */
export const DEFAULT_THEME_ID = "autumn";

/**
 * Read the cookie into a theme id. An unknown value - a forged cookie, or a
 * theme that has since been retired - falls back to the default rather than
 * reaching the page as a `data-theme` that matches no palette.
 */
export function parseThemeId(raw: string | null | undefined): string {
  const id = raw?.trim();
  return THEMES.some((theme) => theme.id === id) ? (id as string) : DEFAULT_THEME_ID;
}

/** The theme for an id, falling back to the default so callers never handle a miss. */
export function themeById(id: string | null | undefined): Theme {
  const wanted = parseThemeId(id);
  return THEMES.find((theme) => theme.id === wanted) ?? THEMES[0];
}
