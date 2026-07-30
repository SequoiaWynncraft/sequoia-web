/** Returns the full-page destination needed to leave a stale client build. */
export function staleNavigationUrl(
  updated: boolean,
  willUnload: boolean,
  destination: URL | null,
): string | null {
  return updated && !willUnload && destination ? destination.href : null;
}
