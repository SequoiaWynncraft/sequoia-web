import { CONFIGURED_DEFAULT_THEME } from "#lib/config/public.js";

export const THEME_COOKIE = "seq_theme";

export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

export interface Theme {
  id: string;
  label: string;
  description: string;
  /** Homepage hero art, a filename under `static/assets/images/`. */
  heroImage: string;
  /** A narrower copy for phones, and the full image's width so the browser can choose. */
  heroSmall?: { src: string; width: number; fullWidth: number };
  /** A few hundred bytes of the art, inlined so the first paint already has its colours. */
  heroPreview?: string;
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
    heroSmall: { src: "fruma_banner-960.avif", width: 960, fullWidth: 1920 },
    heroPreview: "data:image/webp;base64,UklGRgQBAABXRUJQVlA4IPgAAABwBgCdASogABIAPu1mqk2ppaQiMAgBMB2JaAC32DAI7/wCHBXAOukUlGc11u+64EBKka2z0mkwmfK7V8QA/tzYdANiK3FBlJYm1KdSNrb7wLbmY0k7nrpeSPro8Kg39igGIvZuJw3IimIKaomWkGe6t+nCn+26hI+2yJzWygAGCRyMqlwJ0b3TpzTrtjlxha/JhPN8X02hbI4qIAwiqVVMOMG4RebNUXCX++QdJhEMKsNYMi3APk1/n9JpCDF125bLnP7TurOyC+fjqI7HIbP4Qywn9CILEL1JFXV43xiSWKLBkVobXxleylpFVvhAo/mNtYbm74QAAA==",
  },
  {
    id: "autumn",
    label: "Autumn",
    description:
      "Sunlit amber under a red maple canopy: warm umber surfaces, maple terracotta, and a misty horizon.",
    heroImage: "autumn_banner.avif",
    heroSmall: { src: "autumn_banner-600.avif", width: 600, fullWidth: 1200 },
    heroPreview: "data:image/webp;base64,UklGRiABAABXRUJQVlA4IBQBAAAwBwCdASogACUAPuVap02pJSOiNVv4ASAciWQAnTOBBvYj6J8jijRGFXt8xMYCSIPQDBfNOv4Dqdf+nEygw9NaKkAA/ujKfAhF/fulH3oWa7gXvVzOOmzO5lPN7V8O7TzzWW5qXWdiqE2wwW3XtwBMxlpyb+uqvU9AzmuNn9Wl+2Esb5uYqZKH9Vz1FeW1GYb7vRIVDnLqDwzvazU31tOk/L4kpPuNkZ2353BUP+6FsS1d/FUaFIJPN6iaAP0VuoBVtNgrUJnSpVgASxlLsKxD9qJqHXnDElQ9IS6kUMizVpifZOQiTHgWDh/+OPiA87Fz8cop626+8f22HWWPYML3jXnh5YaG6hx163jU121XzcJEwAA=",
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
