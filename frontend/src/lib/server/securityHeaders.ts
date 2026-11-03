import { allowsAnyHttpsImage } from "#lib/config/csp.js";

const BASELINE_HEADERS: Readonly<Record<string, string>> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  // Mirrors the CSP's frame-ancestors 'none' for browsers that predate it.
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

const HSTS = "max-age=31536000";

export function applySecurityHeaders(headers: Headers, url: URL): void {
  for (const [name, value] of Object.entries(BASELINE_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (url.protocol === "https:") headers.set("strict-transport-security", HSTS);
  const policy = headers.get("content-security-policy");
  if (policy && allowsAnyHttpsImage(url.pathname)) {
    headers.set("content-security-policy", allowAnyHttpsImage(policy));
  }
}

function allowAnyHttpsImage(policy: string): string {
  return policy
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean)
    .map((directive) => (directive.startsWith("img-src ") ? `${directive} https:` : directive))
    .join("; ");
}
