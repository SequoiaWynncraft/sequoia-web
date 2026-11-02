import type { sveltekit } from "@sveltejs/kit/vite";

import { resolveApiBaseUrl, resolveNmsrBaseUrl } from "./endpoints";

type KitConfig = NonNullable<Parameters<typeof sveltekit>[0]>;
type CspDirectives = NonNullable<NonNullable<KitConfig["csp"]>["directives"]>;
type Source = NonNullable<CspDirectives["img-src"]>[number];

/** Image hosts outside the site's own origin and skin renders. */
const IMAGE_HOSTS = ["https://assets.seqwawa.com", "https://cdn.discordapp.com"] satisfies Source[];

/**
 * The site's Content Security Policy, from the same public env the app reads.
 *
 * SvelteKit adds a nonce for every script and style element it renders, so
 * neither needs `unsafe-inline`. Markup does carry `style` attributes, which
 * `style-src-attr` allows separately and which cannot run script. Staff-only
 * Discord previews show arbitrary embed images, so those routes widen `img-src`
 * (see {@link allowsAnyHttpsImage}).
 */
export function contentSecurityPolicy(
  env: { apiBaseUrl?: string; nmsrBaseUrl?: string },
  dev: boolean,
): CspDirectives {
  const api = originsOf(resolveApiBaseUrl(env.apiBaseUrl, dev));
  const nmsr = originsOf(resolveNmsrBaseUrl(env.nmsrBaseUrl));
  return {
    "default-src": ["self"],
    "script-src": ["self"],
    "style-src": ["self"],
    "style-src-attr": ["unsafe-inline"],
    "img-src": ["self", "data:", "blob:", ...nmsr, ...IMAGE_HOSTS],
    "font-src": ["self"],
    // Browser code only calls same-origin endpoints; the API is reached by links.
    "connect-src": ["self"],
    // Saving linked accounts redirects through the API's session refresh.
    "form-action": ["self", ...api],
    "frame-src": ["none"],
    "frame-ancestors": ["none"],
    "object-src": ["none"],
    "base-uri": ["self"],
  };
}

/** Staff-only Discord editors preview embed images from wherever the message points. */
const OPEN_IMAGE_ROUTES = "/manage/discord";

/**
 * Whether a page's policy also allows any HTTPS image. A document keeps the
 * policy it was loaded with, so client navigation must not cross this boundary.
 */
export function allowsAnyHttpsImage(pathname: string): boolean {
  return pathname === OPEN_IMAGE_ROUTES || pathname.startsWith(`${OPEN_IMAGE_ROUTES}/`);
}

/** The origin of an absolute base URL; a same-origin (relative) base needs none beyond `self`. */
function originsOf(base: string): Source[] {
  if (!URL.canParse(base)) return [];
  const origin = new URL(base).origin;
  return isOriginSource(origin) ? [origin] : [];
}

function isOriginSource(value: string): value is Extract<Source, `${string}://${string}`> {
  return /^[a-z][a-z0-9+.-]*:\/\/[^/?#\s]+$/i.test(value);
}
