import { defineEnvVars } from "@sveltejs/kit/env";

const optional = (value: string | undefined) => value;

const buildTimePublic = { public: true, static: true, schema: optional };

export const variables = defineEnvVars({
  PUBLIC_SEQUOIA_API_BASE_URL: {
    ...buildTimePublic,
    description: "Sequoia API origin, or `same-origin` when a proxy routes /public/** to it.",
  },
  PUBLIC_NMSR_BASE_URL: {
    ...buildTimePublic,
    description: "Skin render origin, or `same-origin` when a proxy routes /nmsr to it.",
  },
  PUBLIC_SEQUOIA_MOD_VERSION: {
    ...buildTimePublic,
    description: "Mod version sent to the backend's client-compatibility gate.",
  },
  PUBLIC_SEQUOIA_GUILD_UUID: {
    ...buildTimePublic,
    description: "Wynncraft uuid of the guild the site is about.",
  },
  PUBLIC_DEFAULT_THEME: {
    ...buildTimePublic,
    description: "Theme id for visitors who have not picked one.",
  },
  PUBLIC_SITE_NAME: { ...buildTimePublic, description: "Site name shown in titles, navigation and footer." },
  PUBLIC_SITE_TAGLINE: { ...buildTimePublic, description: "Short tagline for the default page title." },
  PUBLIC_SITE_DESCRIPTION: { ...buildTimePublic, description: "Default meta description and footer summary." },
  PUBLIC_SITE_LOGO: { ...buildTimePublic, description: "Logo and favicon path or data: URL." },
  PUBLIC_SITE_DISCORD_URL: { ...buildTimePublic, description: "Community Discord invite." },
  PUBLIC_SITE_GITHUB_URL: { ...buildTimePublic, description: "GitHub organization or repository link." },
  PUBLIC_SITE_MAP_URL: { ...buildTimePublic, description: "Territory map link." },
  SEQUOIA_WEB_BACKEND_URL: { schema: optional, description: "Rust web backend origin." },
  SEQUOIA_WEB_BACKEND_INTERNAL_TOKEN: {
    schema: optional,
    description: "Rust web backend INTERNAL_API_TOKEN; gates member-only tracker reads.",
  },
  SEQUOIA_BACKEND_URL: {
    schema: optional,
    description: "Server-side sequoia-backend origin; required in same-origin mode.",
  },
  SEQUOIA_BACKEND_INTERNAL_TOKEN: {
    schema: optional,
    description: "sequoia-backend INTERNAL_API_TOKEN; gates mod-tracked contribution reads.",
  },
  BAGSHOP_API_URL: { schema: optional, description: "Internal bag shop bot HTTP API origin." },
  SEQUOIA_DISCORD_MANAGEMENT_URL: {
    schema: optional,
    description: "Private Sierra management listener origin.",
  },
  SEQUOIA_WEB_DB_URL: { schema: optional, description: "libSQL URL for web-owned caches." },
  TURSO_DATABASE_URL: { schema: optional, description: "Turso URL; overrides SEQUOIA_WEB_DB_URL." },
  TURSO_AUTH_TOKEN: { schema: optional, description: "Turso auth token." },
});
