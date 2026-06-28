import { dev } from "$app/environment";
import * as publicEnv from "$env/static/public";

const configuredBaseUrl = envValue("PUBLIC_SEQUOIA_API_BASE_URL").trim();

export const SEQUOIA_API_BASE_URL =
  configuredBaseUrl === "same-origin"
    ? ""
    : configuredBaseUrl || (dev ? "http://localhost:8081" : "https://api.seqwawa.com");

function envValue(key: string): string {
  return (publicEnv as Record<string, string | undefined>)[key] ?? "";
}
