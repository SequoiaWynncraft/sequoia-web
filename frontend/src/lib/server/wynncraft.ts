export const WYNNCRAFT_API_BASE = "https://api.wynncraft.com/v3";

export async function fetchWynncraftJson(fetchImpl: typeof fetch, path: string): Promise<unknown> {
  const response = await fetchImpl(`${WYNNCRAFT_API_BASE}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Wynncraft request ${path} failed with status ${response.status}.`);
  }
  return response.json();
}
