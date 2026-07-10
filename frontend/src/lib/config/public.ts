import { dev } from "$app/environment";
import * as publicEnv from "$env/static/public";

const configuredBaseUrl = envValue("PUBLIC_SEQUOIA_API_BASE_URL").trim();
const configuredNmsrBaseUrl = envValue("PUBLIC_NMSR_BASE_URL").trim();

export const SEQUOIA_API_BASE_URL =
  configuredBaseUrl === "same-origin"
    ? ""
    : configuredBaseUrl || (dev ? "http://localhost:8081" : "https://api.seqwawa.com");

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
