/**
 * The public API and skin-render bases, resolved from build-time public env.
 *
 * Plain functions without SvelteKit imports, so the Vite config can derive
 * the Content Security Policy from exactly the origins the app will use.
 */

/** Sequoia API base without a trailing slash; empty in same-origin mode. */
export function resolveApiBaseUrl(configured: string | undefined, dev: boolean): string {
  const value = (configured ?? "").trim().replace(/\/+$/, "");
  if (value === "same-origin") return "";
  return value || (dev ? "http://localhost:8081" : "https://api.seqwawa.com");
}

/** NMSR skin-render base without a trailing slash; `/nmsr` in same-origin mode. */
export function resolveNmsrBaseUrl(configured: string | undefined): string {
  const value = (configured ?? "").trim().replace(/\/+$/, "");
  if (value === "same-origin") return "/nmsr";
  return value || "https://nmsr.seqwawa.com";
}
