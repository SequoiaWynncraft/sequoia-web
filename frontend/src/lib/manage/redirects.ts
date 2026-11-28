const LEGACY_PREFIXES: readonly [from: string, to: string][] = [
  ["/services/bagshop/manage", "/manage/treasury/bagshop"],
  ["/events/manage/audit", "/manage/development/audit"],
  ["/events/manage", "/manage/events"],
  ["/manage/events/audit", "/manage/development/audit"],
  ["/manage/bagshop", "/manage/treasury/bagshop"],
];

/**
 * Maps a legacy management path to its /manage/** replacement, preserving
 * the sub-path and query string. Returns null for non-legacy paths.
 */
export function legacyManageRedirect(pathname: string, search = ""): string | null {
  for (const [from, to] of LEGACY_PREFIXES) {
    if (pathname === from || pathname.startsWith(`${from}/`)) {
      return `${to}${pathname.slice(from.length)}${search}`;
    }
  }
  return null;
}
