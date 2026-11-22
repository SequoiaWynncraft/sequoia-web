import { LEAF_BASE_URL } from "$app/env/private";

import { isNonNegativeInteger, isRecord } from "#lib/api/guards.js";
import { sequoiaBackendOrigin } from "#lib/server/sequoiaBackend.js";

const DEFAULT_LEAF_BASE_URL = "https://leaf.seqwawa.com";
const RATES_PATH = "/v1/rates";
const PRICES_PATH = "/api/reward-queue/prices";
const REQUEST_TIMEOUT_MS = 5000;
/** Leaf sends its rates with `max-age=300`. */
const ANSWER_TTL_MS = 5 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 1000;

const CHANGED_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** A run of a rate's text: plain, bold (Discord's `**`), or a line break. */
export type RatePart = { kind: "text" | "strong"; text: string } | { kind: "break" };

export interface LeafRateSection {
  name: string;
  parts: RatePart[];
}

export interface LeafRates {
  sections: LeafRateSection[];
  /** When the rates last changed: the instant, and its UTC day as "21 November 2026". */
  changed: { at: string; label: string } | null;
}

/** What a tome or aspect request costs in Leaf. */
export interface RequestPrices {
  tome: number;
  aspect: number;
}

export interface LeafGuide {
  rates: LeafRates | null;
  prices: RequestPrices | null;
}

/**
 * Split a rate's text into plain and bold runs and line breaks, so the page
 * renders each as a text node. An unpaired `**` stays as written.
 */
export function rateParts(text: string): RatePart[] {
  const runs = text.replace(/\r\n?/g, "\n").trim().split("**");
  if (runs.length % 2 === 0) {
    const unpaired = runs.pop();
    runs[runs.length - 1] += `**${unpaired}`;
  }

  const parts: RatePart[] = [];
  runs.forEach((run, index) => {
    run.split("\n").forEach((line, lineIndex) => {
      if (lineIndex > 0) parts.push({ kind: "break" });
      if (line) parts.push({ kind: index % 2 === 1 ? "strong" : "text", text: line });
    });
  });
  return parts;
}

/** Leaf's `/v1/rates` answer, or null for anything that isn't one. Blank sections are left out. */
export function parseLeafRates(body: unknown): LeafRates | null {
  if (!isRecord(body) || !Array.isArray(body.sections)) return null;

  const sections: LeafRateSection[] = [];
  for (const section of body.sections) {
    if (!isRecord(section) || typeof section.name !== "string" || typeof section.text !== "string") return null;
    const name = section.name.trim();
    const parts = rateParts(section.text);
    if (name && parts.length > 0) sections.push({ name, parts });
  }
  if (sections.length === 0) return null;

  const changedAt = body.changed_at ?? null;
  if (changedAt === null) return { sections, changed: null };
  const time = typeof changedAt === "string" ? Date.parse(changedAt) : Number.NaN;
  if (Number.isNaN(time)) return null;
  return { sections, changed: { at: new Date(time).toISOString(), label: CHANGED_DAY.format(time) } };
}

/** The backend's `/api/reward-queue/prices` answer, or null for anything that isn't one. */
export function parseRequestPrices(body: unknown): RequestPrices | null {
  if (!isRecord(body) || !isNonNegativeInteger(body.tome) || !isNonNegativeInteger(body.aspect)) return null;
  return { tome: body.tome, aspect: body.aspect };
}

/** Leaf's rates and the request prices, each cached for every visitor; null where one can't be read. */
export async function loadLeafGuide(fetchImpl: typeof fetch): Promise<LeafGuide> {
  const [rates, prices] = await Promise.all([leafRates(fetchImpl), requestPrices(fetchImpl)]);
  return { rates, prices };
}

const leafRates = remembered(async (fetchImpl) =>
  parseLeafRates(await readJson(`${leafBaseUrl()}${RATES_PATH}`, fetchImpl)),
);

const requestPrices = remembered(async (fetchImpl) => {
  const origin = sequoiaBackendOrigin();
  return origin === null ? null : parseRequestPrices(await readJson(`${origin}${PRICES_PATH}`, fetchImpl));
});

function leafBaseUrl(): string {
  return (LEAF_BASE_URL ?? "").trim().replace(/\/+$/, "") || DEFAULT_LEAF_BASE_URL;
}

async function readJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.status === 200 ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * One answer shared by every request: kept for five minutes, or for thirty
 * seconds when it couldn't be read, with concurrent requests sharing one load.
 */
function remembered<T>(load: (fetchImpl: typeof fetch) => Promise<T | null>) {
  let kept: { value: T | null; until: number } | null = null;
  let loading: Promise<T | null> | null = null;

  return (fetchImpl: typeof fetch): Promise<T | null> => {
    if (kept !== null && Date.now() < kept.until) return Promise.resolve(kept.value);
    loading ??= load(fetchImpl)
      .catch(() => null)
      .then((value) => {
        kept = { value, until: Date.now() + (value === null ? FAILURE_TTL_MS : ANSWER_TTL_MS) };
        return value;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  };
}
