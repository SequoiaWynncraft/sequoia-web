import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "$env/dynamic/private";
import { createClient, type Client } from "@libsql/client";

import {
  isBranchmastersResponse,
  type BranchmasterMember,
  type BranchmasterRank,
  type BranchmastersResponse,
} from "$lib/api/branchmasters";

const WYNNCRAFT_GUILD_URL = "https://api.wynncraft.com/v3/guild/prefix/SEQ";
const CACHE_KEY = "branchmasters:v1";
const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;
const RANKS = ["owner", "chief", "strategist"] as const;
const RANK_ORDER = new Map<BranchmasterRank, number>(RANKS.map((rank, index) => [rank, index]));

let dbPromise: Promise<Client> | undefined;

export async function getBranchmasters(fetchImpl: typeof fetch): Promise<BranchmastersResponse> {
  const cached = await readCache();
  const now = Date.now();
  if (cached && now - cached.updatedAt < FRESH_MS) return cached.data;

  try {
    const fresh = await fetchWynncraftBranchmasters(fetchImpl);
    await writeCache(fresh, now);
    return fresh;
  } catch {
    if (cached && now - cached.updatedAt < STALE_MS) return cached.data;
    throw new Error("Unable to load branchmasters.");
  }
}

export async function fetchWynncraftBranchmasters(fetchImpl: typeof fetch): Promise<BranchmastersResponse> {
  const response = await fetchImpl(WYNNCRAFT_GUILD_URL, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Wynncraft guild request failed with status ${response.status}.`);
  }

  return parseWynncraftBranchmasters(await response.json());
}

export function parseWynncraftBranchmasters(value: unknown): BranchmastersResponse {
  if (!isRecord(value)) {
    throw new Error("Unexpected Wynncraft guild response.");
  }

  const rawMembers = value.members;
  if (!isRecord(rawMembers)) {
    throw new Error("Unexpected Wynncraft guild response.");
  }

  const members = RANKS.flatMap((rank) => parseRankMembers(rank, rawMembers)).sort(compareMembers);
  return {
    generated_at: new Date().toISOString(),
    members,
  };
}

async function readCache(): Promise<{ data: BranchmastersResponse; updatedAt: number } | null> {
  const db = await database();
  const result = await db.execute({
    sql: "SELECT value, updated_at FROM api_cache WHERE key = ?",
    args: [CACHE_KEY],
  });
  const row = result.rows[0];
  if (!row || typeof row.value !== "string" || typeof row.updated_at !== "number") return null;

  try {
    const data = JSON.parse(row.value);
    if (!isBranchmastersResponse(data)) return null;
    return { data, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

async function writeCache(data: BranchmastersResponse, updatedAt: number) {
  const db = await database();
  await db.execute({
    sql: "INSERT OR REPLACE INTO api_cache (key, value, updated_at) VALUES (?, ?, ?)",
    args: [CACHE_KEY, JSON.stringify(data), updatedAt],
  });
}

async function database(): Promise<Client> {
  dbPromise ??= createDatabase();
  return dbPromise;
}

async function createDatabase(): Promise<Client> {
  const url = databaseUrl();
  const localPath = localDatabasePath(url);
  if (localPath) await mkdir(path.dirname(localPath), { recursive: true });

  const client = createClient({
    url,
    authToken: env.TURSO_AUTH_TOKEN?.trim() || undefined,
    timeout: 5000,
  });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS api_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  return client;
}

function databaseUrl(): string {
  return env.TURSO_DATABASE_URL?.trim() || env.SEQUOIA_WEB_DB_URL?.trim() || "file:.data/sequoia-web.db";
}

function localDatabasePath(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  const value = url.slice("file:".length);
  if (value.startsWith("//")) return fileURLToPath(url);
  return path.resolve(process.cwd(), value || ".data/sequoia-web.db");
}

function parseRankMembers(rank: BranchmasterRank, members: Record<string, unknown>): BranchmasterMember[] {
  const group = members[rank];
  if (!isRecord(group)) return [];

  return Object.entries(group).map(([username, member]) => {
    if (!isRecord(member)) throw new Error("Unexpected Wynncraft member response.");
    const globalData = isRecord(member.globalData) ? member.globalData : {};
    const raids = isRecord(globalData.raids) ? finiteNumber(globalData.raids.total) ?? 0 : 0;

    return {
      username: stringValue(member.legacyName) ?? username,
      rank,
      online: booleanValue(member.online),
      contributed: requiredNumber(member.contributed),
      contribution_rank: requiredNumber(member.contributionRank),
      wars: finiteNumber(globalData.wars) ?? 0,
      raids,
      joined: requiredString(member.joined),
    };
  });
}

function compareMembers(a: BranchmasterMember, b: BranchmasterMember): number {
  return (
    (RANK_ORDER.get(a.rank) ?? 99) - (RANK_ORDER.get(b.rank) ?? 99) ||
    a.contribution_rank - b.contribution_rank ||
    b.contributed - a.contributed ||
    a.username.localeCompare(b.username)
  );
}

function requiredNumber(value: unknown): number {
  const number = finiteNumber(value);
  if (number === undefined) throw new Error("Unexpected Wynncraft numeric field.");
  return number;
}

function requiredString(value: unknown): string {
  const string = stringValue(value);
  if (!string) throw new Error("Unexpected Wynncraft string field.");
  return string;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
