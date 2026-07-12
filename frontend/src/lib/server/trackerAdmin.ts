import { fail } from "@sveltejs/kit";
import type { Cookies } from "@sveltejs/kit";

import type { TrackerOption } from "./eventFormContext";
import { requireEventManager } from "./eventManagers";
import { formatWindow } from "$lib/events/format";
import type { RaidEvent } from "./raidEventBoards";
import { sequoiaWebBackendInternalHeaders, sequoiaWebBackendUrl } from "./sequoiaWebBackend";

const ZONED_PATTERN = /(?:z|[+-]\d\d:\d\d)$/i;

interface TrackerRequest {
  name: string;
  startsAt: string;
  endsAt: string;
  tracking: "api" | "mod";
  raid?: string;
}

/**
 * Shared ?/createTracker form action for the event editor: creates a raid
 * tracker event in the backend and returns it as a picker option.
 */
export async function createTrackerAction(event: {
  request: Request;
  cookies: Cookies;
  fetch: typeof fetch;
}) {
  await requireEventManager(event);
  const parsed = parseTrackerRequest((await event.request.formData()).get("trackerPayload"));
  if (typeof parsed === "string") return fail(400, { trackerError: parsed });

  const headers = sequoiaWebBackendInternalHeaders();
  if (!headers) return fail(503, { trackerError: "The tracker backend is not configured." });

  try {
    const response = await event.fetch(sequoiaWebBackendUrl("/internal/raid-events"), {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        slug: trackerSlug(parsed.name),
        name: parsed.name,
        starts_at: parsed.startsAt,
        ends_at: parsed.endsAt,
        tracking: parsed.tracking,
        raid: parsed.raid,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return fail(400, { trackerError: body?.error ?? "The tracker event could not be created." });
    }
    const created = (await response.json()) as RaidEvent;
    const option: TrackerOption = {
      id: created.id,
      name: created.name,
      window: formatWindow({ startsAt: created.starts_at, endsAt: created.ends_at }) ?? "no window",
      tracking: created.tracking ?? "api",
      raid: created.raid ?? null,
    };
    return { trackerCreated: option };
  } catch {
    return fail(502, { trackerError: "The tracker backend did not respond." });
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
