import { fail } from "@sveltejs/kit";
import type { Cookies } from "@sveltejs/kit";

import type { Viewer } from "$lib/site/viewer";

import { recordAudit } from "./auditLog";
import { trackerOption, type TrackerOption } from "./eventFormContext";
import { requireEventManager } from "./eventManagers";
import type { RaidEvent } from "./raidEventBoards";
import { sequoiaWebBackendInternalHeaders, sequoiaWebBackendUrl } from "./sequoiaWebBackend";

const ZONED_PATTERN = /(?:z|[+-]\d\d:\d\d)$/i;

interface TrackerRequest {
  id?: string;
  name: string;
  startsAt: string;
  endsAt: string;
  tracking: "api" | "mod";
  raid?: string;
}

type ManageRequest = {
  request: Request;
  cookies: Cookies;
  fetch: typeof fetch;
  locals: App.Locals;
};

/**
 * Shared ?/createTracker form action for the event editor: creates a raid
 * tracker event in the backend and returns it as a picker option.
 */
export async function createTrackerAction(event: ManageRequest) {
  const authorized = await authorizeAndParse(event);
  if (typeof authorized.parsed === "string") return fail(400, { trackerError: authorized.parsed });
  const parsed = authorized.parsed;
  const result = await submitTracker(event.fetch, "POST", "/internal/raid-events", {
    slug: trackerSlug(parsed.name),
    name: parsed.name,
    starts_at: parsed.startsAt,
    ends_at: parsed.endsAt,
    tracking: parsed.tracking,
    raid: parsed.raid,
  });
  if (typeof result === "string") return fail(400, { trackerError: result });
  const audited = await recordAudit(authorized.manager, "tracker.create", result.id, parsed.name);
  return { trackerCreated: result, auditWarning: !audited };
}

/** Shared ?/updateTracker form action: full update of an existing tracker. */
export async function updateTrackerAction(event: ManageRequest) {
  const authorized = await authorizeAndParse(event);
  if (typeof authorized.parsed === "string") return fail(400, { trackerError: authorized.parsed });
  const parsed = authorized.parsed;
  if (!parsed.id) return fail(400, { trackerError: "Malformed submission." });
  const result = await submitTracker(
    event.fetch,
    "PUT",
    `/internal/raid-events/${encodeURIComponent(parsed.id)}`,
    {
      name: parsed.name,
      starts_at: parsed.startsAt,
      ends_at: parsed.endsAt,
      tracking: parsed.tracking,
      raid: parsed.raid,
    },
  );
  if (typeof result === "string") return fail(400, { trackerError: result });
  const audited = await recordAudit(authorized.manager, "tracker.update", parsed.id, parsed.name);
  return { trackerUpdated: result, auditWarning: !audited };
}

async function authorizeAndParse(
  event: ManageRequest,
): Promise<{ manager: Viewer; parsed: TrackerRequest | string }> {
  const manager = await requireEventManager(event);
  return { manager, parsed: parseTrackerRequest((await event.request.formData()).get("trackerPayload")) };
}

async function submitTracker(
  fetchImpl: typeof fetch,
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown>,
): Promise<TrackerOption | string> {
  const headers = sequoiaWebBackendInternalHeaders();
  if (!headers) return "The tracker backend is not configured.";
  try {
    const response = await fetchImpl(sequoiaWebBackendUrl(path), {
      method,
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
      return errorBody?.error ?? "The tracker backend rejected the request.";
    }
    return trackerOption((await response.json()) as RaidEvent);
  } catch {
    return "The tracker backend did not respond.";
  }
}

function parseTrackerRequest(raw: FormDataEntryValue | null): TrackerRequest | string {
  if (typeof raw !== "string" || raw.length > 4096) return "Malformed submission.";
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return "Malformed submission.";
  }
  if (typeof json !== "object" || json === null) return "Malformed submission.";
  const record = json as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name || name.length > 80) return "the tracker needs a name";
  const startsAt = instant(record.startsAt);
  const endsAt = instant(record.endsAt);
  if (!startsAt || !endsAt) return "the tracker needs a start and an end";
  if (Date.parse(startsAt) >= Date.parse(endsAt)) return "the tracker must end after it starts";
  if (record.tracking !== "api" && record.tracking !== "mod") {
    return "tracking must be api or mod";
  }
  const request: TrackerRequest = { name, startsAt, endsAt, tracking: record.tracking };
  if (typeof record.id === "string" && record.id.trim()) request.id = record.id.trim();
  const raid = typeof record.raid === "string" ? record.raid.trim() : "";
  if (raid) {
    if (record.tracking !== "mod") return "raid scoping needs mod tracking";
    request.raid = raid;
  }
  return request;
}

function instant(value: unknown): string | null {
  if (typeof value !== "string" || !ZONED_PATTERN.test(value.trim()) || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return new Date(Date.parse(value)).toISOString();
}

function trackerSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  // The backend requires unique slugs; a time suffix keeps retries and
  // same-named events from colliding.
  return `${base || "tracker"}-${Date.now().toString(36)}`;
}
