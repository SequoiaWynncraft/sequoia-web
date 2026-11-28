import { dev } from "$app/env";
import {
  PUBLIC_DEFAULT_THEME,
  PUBLIC_NMSR_BASE_URL,
  PUBLIC_SEQUOIA_API_BASE_URL,
  PUBLIC_SEQUOIA_GUILD_UUID,
  PUBLIC_SEQUOIA_MOD_VERSION,
} from "$app/env/public";

import { resolveApiBaseUrl, resolveNmsrBaseUrl } from "./endpoints";

export const SEQUOIA_API_BASE_URL = resolveApiBaseUrl(PUBLIC_SEQUOIA_API_BASE_URL, dev);

export const SEQUOIA_MOD_VERSION = (PUBLIC_SEQUOIA_MOD_VERSION ?? "").trim() || "1.6.8";

export const SEQUOIA_GUILD_UUID =
  (PUBLIC_SEQUOIA_GUILD_UUID ?? "").trim() || "ee860b7c-9a1d-49cf-9f19-ab673ba0f23b";

export const CONFIGURED_DEFAULT_THEME = (PUBLIC_DEFAULT_THEME ?? "").trim();

export const NMSR_BASE_URL = resolveNmsrBaseUrl(PUBLIC_NMSR_BASE_URL);

export const NMSR_PRECONNECT_ORIGIN = NMSR_BASE_URL.startsWith("https://")
  ? new URL(NMSR_BASE_URL).origin
  : null;
