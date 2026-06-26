import { dev } from "$app/environment";
import { env } from "$env/dynamic/public";

const configuredBaseUrl = (env.PUBLIC_SEQUOIA_API_BASE_URL ?? "").trim();

export const SEQUOIA_API_BASE_URL =
  configuredBaseUrl === "same-origin"
    ? ""
    : configuredBaseUrl || (dev ? "http://localhost:8081" : "https://api.seqwawa.com");
