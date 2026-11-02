/**
 * Baseline browser protections for every response the app renders. Static
 * assets served before the app's handler rely on the reverse proxy instead.
 */
const BASELINE_HEADERS: Readonly<Record<string, string>> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  // Mirrors the CSP's frame-ancestors 'none' for browsers that predate it.
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

/**
 * One year, for this host only. includeSubDomains and preload would commit
 * every *.seqwawa.com service to HTTPS, which is an owner decision.
 */
const HSTS = "max-age=31536000";

/** Staff-only Discord editors preview embed images from wherever the message points. */
const OPEN_IMAGE_ROUTES = "/manage/discord";

/**
 * Adds the baseline security headers to an app response, keeping any value a
 * route already chose. HSTS is sent only over HTTPS, where browsers honor it.
 */
export function applySecurityHeaders(headers: Headers, url: URL): void {
  for (const [name, value] of Object.entries(BASELINE_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (url.protocol === "https:") headers.set("strict-transport-security", HSTS);
  const policy = headers.get("content-security-policy");
  if (policy && isUnder(url.pathname, OPEN_IMAGE_ROUTES)) {
    headers.set("content-security-policy", allowAnyHttpsImage(policy));
  }
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function allowAnyHttpsImage(policy: string): string {
  return policy
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean)
    .map((directive) => (directive.startsWith("img-src ") ? `${directive} https:` : directive))
    .join("; ");
}
