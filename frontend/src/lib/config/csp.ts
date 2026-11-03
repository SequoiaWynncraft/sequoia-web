import type { sveltekit } from "@sveltejs/kit/vite";

import { RAID_ICON_BASE } from "../events/raidIcons";
import { resolveApiBaseUrl, resolveNmsrBaseUrl } from "./endpoints";

type KitConfig = NonNullable<Parameters<typeof sveltekit>[0]>;
type CspDirectives = NonNullable<NonNullable<KitConfig["csp"]>["directives"]>;
type Source = NonNullable<CspDirectives["img-src"]>[number];

const IMAGE_HOSTS = ["https://assets.seqwawa.com", "https://cdn.discordapp.com"] satisfies Source[];

export function contentSecurityPolicy(
  env: { apiBaseUrl?: string; nmsrBaseUrl?: string },
  dev: boolean,
): CspDirectives {
  const api = originsOf(resolveApiBaseUrl(env.apiBaseUrl, dev));
  const nmsr = originsOf(resolveNmsrBaseUrl(env.nmsrBaseUrl));
  const raidIcons = originsOf(RAID_ICON_BASE);
  return {
    "default-src": ["self"],
    "script-src": ["self"],
    "style-src": ["self"],
    "style-src-attr": ["unsafe-inline"],
    "img-src": ["self", "data:", "blob:", ...nmsr, ...raidIcons, ...IMAGE_HOSTS],
    "font-src": ["self"],
    "connect-src": ["self"],
    "form-action": ["self", ...api],
    "frame-src": ["none"],
    "frame-ancestors": ["none"],
    "object-src": ["none"],
    "base-uri": ["self"],
  };
}

const OPEN_IMAGE_ROUTES = "/manage/discord";

/**
 * Whether a page's policy also allows any HTTPS image. A document keeps the
 * policy it was loaded with, so client navigation must not cross this boundary.
 */
export function allowsAnyHttpsImage(pathname: string): boolean {
  return pathname === OPEN_IMAGE_ROUTES || pathname.startsWith(`${OPEN_IMAGE_ROUTES}/`);
}

function originsOf(base: string): Source[] {
  if (!URL.canParse(base)) return [];
  const origin = new URL(base).origin;
  return isOriginSource(origin) ? [origin] : [];
}

function isOriginSource(value: string): value is Extract<Source, `${string}://${string}`> {
  return /^[a-z][a-z0-9+.-]*:\/\/[^/?#\s]+$/i.test(value);
}
