import { dev } from "$app/environment";
import * as publicEnv from "$env/static/public";

const configuredBaseUrl = envValue("PUBLIC_SEQUOIA_API_BASE_URL").trim().replace(/\/+$/, "");
const configuredNmsrBaseUrl = envValue("PUBLIC_NMSR_BASE_URL").trim().replace(/\/+$/, "");

export const SEQUOIA_API_BASE_URL =
  configuredBaseUrl === "same-origin"
    ? ""
    : configuredBaseUrl || (dev ? "http://localhost:8081" : "https://api.seqwawa.com");

/**
 * Mod version advertised to the Sequoia backend via the `X-Sequoia-Mod-Version` header on
 * gated `/api/**` calls. The backend's client-compatibility gate rejects (426) requests without
 * a usable version when it runs in ENFORCE mode, so the website sends the current mod release.
 * Overridable via env so ops can bump it without a code change when the minimum is raised.
 */
export const SEQUOIA_MOD_VERSION = envValue("PUBLIC_SEQUOIA_MOD_VERSION").trim() || "1.6.8";

/**
 * Wynncraft uuid of the guild the site is about. Everything else here identifies
 * Sequoia by prefix (`/guild/prefix/SEQ`), but the backend's guild level-history
 * route takes a uuid path variable, so the uuid has to be spelled out somewhere.
 * Overridable via env so a redeploy can point a preview build at another guild.
 */
export const SEQUOIA_GUILD_UUID =
  envValue("PUBLIC_SEQUOIA_GUILD_UUID").trim() || "ee860b7c-9a1d-49cf-9f19-ab673ba0f23b";

/**
 * Theme id every visitor gets until they pick one. Raw and unvalidated here -
 * `$lib/site/themePreferences` checks it against the registered themes and
 * falls back to its own default when it names none of them.
 */
export const CONFIGURED_DEFAULT_THEME = envValue("PUBLIC_DEFAULT_THEME").trim();

export const NMSR_BASE_URL =
  configuredNmsrBaseUrl === "same-origin"
    ? "/nmsr"
    : configuredNmsrBaseUrl || "https://nmsr.seqwawa.com";

/** Origin to preconnect to for skin renders, when served from a dedicated host. */
export const NMSR_PRECONNECT_ORIGIN = NMSR_BASE_URL.startsWith("https://")
  ? new URL(NMSR_BASE_URL).origin
  : null;

function envValue(key: string): string {
  return (publicEnv as Record<string, string | undefined>)[key] ?? "";
}
