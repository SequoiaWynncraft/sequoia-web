import {
  PUBLIC_SITE_DESCRIPTION,
  PUBLIC_SITE_DISCORD_URL,
  PUBLIC_SITE_LOGO,
  PUBLIC_SITE_MAP_URL,
  PUBLIC_SITE_NAME,
  PUBLIC_SITE_TAGLINE,
} from "$app/env/public";

/**
 * How the website presents itself. The guild it tracks (its Wynncraft name,
 * prefix and uuid), backend identifiers and the legal controller are separate
 * and stay as they are when the site is renamed.
 */
export interface Brand {
  name: string;
  tagline: string;
  description: string;
  /** Logo and favicon: a same-origin path or a `data:` URL. */
  logo: string;
  discordUrl: string;
  mapUrl: string;
}

const set = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export const BRAND: Brand = {
  name: set(PUBLIC_SITE_NAME, "Sequoia"),
  tagline: set(PUBLIC_SITE_TAGLINE, "Rooted in Purpose"),
  description: set(
    PUBLIC_SITE_DESCRIPTION,
    "Wynncraft guild resources, player and guild statistics, and community.",
  ),
  logo: set(PUBLIC_SITE_LOGO, "/assets/images/fruma-icon.png"),
  discordUrl: set(PUBLIC_SITE_DISCORD_URL, "https://discord.gg/seq"),
  mapUrl: set(PUBLIC_SITE_MAP_URL, "https://map.seqwawa.com"),
};

/** Document title for a page, suffixed with the site name. */
export function pageTitle(title: string): string {
  return `${title} - ${BRAND.name}`;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);

/** Fills the brand placeholders in `app.html`. */
export function fillBrandPlaceholders(html: string): string {
  return html
    .replace("%site.title%", escapeHtml(`${BRAND.name} - ${BRAND.tagline}`))
    .replace("%site.description%", escapeHtml(`${BRAND.name} - ${BRAND.description}`))
    .replace("%site.logo%", escapeHtml(BRAND.logo));
}
