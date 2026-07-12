import { RAID_ICONS } from "./raidIcons";
import type {
  CompRole,
  EventGoal,
  EventIcon,
  EventIconPlacement,
  EventTheme,
  GuildEvent,
  PrizeEntry,
} from "./types";

export type ParseResult = { ok: true; event: GuildEvent } | { ok: false; error: string };

/** Route segments under /events that an event slug must never shadow. */
const RESERVED_SLUGS = new Set(["manage", "new", "audit"]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const ZONED_PATTERN = /(?:z|[+-]\d\d:\d\d)$/i;

/**
 * Strict parser for event data crossing a trust boundary: management form
 * submissions and database rows. Unknown fields are dropped, strings are
 * trimmed, colors lowercased, instants normalized to UTC ISO strings, and
 * empty optional sections omitted entirely.
 */
export function parseGuildEvent(value: unknown): ParseResult {
  try {
    return { ok: true, event: parseEvent(value) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message);
}

function parseEvent(value: unknown): GuildEvent {
  const raw = asRecord(value, "event");
  const event: GuildEvent = {
    slug: parseSlug(raw.slug),
    name: requiredText(raw.name, "name", 80),
    tagline: requiredText(raw.tagline, "tagline", 200),
    access: parseAccess(raw.access),
    theme: parseTheme(raw.theme),
  };

  const startsAt = present(raw.startsAt) ? parseInstant(raw.startsAt, "start date") : undefined;
  const endsAt = present(raw.endsAt) ? parseInstant(raw.endsAt, "end date") : undefined;
  if ((startsAt === undefined) !== (endsAt === undefined)) fail("set both dates, or neither for TBA");
  if (startsAt !== undefined && endsAt !== undefined) {
    if (Date.parse(startsAt) >= Date.parse(endsAt)) fail("the event must end after it starts");
    event.startsAt = startsAt;
    event.endsAt = endsAt;
  }

  if (present(raw.icon)) event.icon = parseIcon(raw.icon);
  const about = parseLines(raw.about, "about", 2000);
  if (about) event.about = about;
  const goals = parseGoals(raw);
  if (goals) event.goals = goals;
  if (present(raw.activity)) event.activity = parseActivity(raw.activity);
  const prizes = parseList(raw.prizes, "prizes", parsePrize);
  if (prizes) event.prizes = prizes;
  const prizesNote = optionalText(raw.prizesNote, "prizes note", 500);
  if (prizesNote) event.prizesNote = prizesNote;
  if (present(raw.comp)) event.comp = parseComp(raw.comp);
  const rules = parseLines(raw.rules, "rules", 500);
  if (rules) event.rules = rules;
  if (present(raw.tracker)) event.tracker = parseTracker(raw.tracker);
  return event;
}

function parseSlug(value: unknown): string {
  const slug = requiredText(value, "slug", 64);
  if (!SLUG_PATTERN.test(slug)) fail("slug must be lowercase words separated by hyphens");
  if (RESERVED_SLUGS.has(slug)) fail(`"${slug}" is a reserved slug`);
  return slug;
}

function parseAccess(value: unknown): GuildEvent["access"] {
  if (value !== "public" && value !== "members") fail("access must be public or members");
  return value;
}

function parseTheme(value: unknown): EventTheme {
  const raw = asRecord(value, "theme");
  if (!Array.isArray(raw.sky) || raw.sky.length !== 2) fail("theme needs two sky colors");
  return {
    sky: [parseColor(raw.sky[0], "sky top"), parseColor(raw.sky[1], "sky bottom")],
    accent: parseColor(raw.accent, "accent"),
    accentSecondary: parseColor(raw.accentSecondary, "secondary accent"),
    star: parseColor(raw.star, "star color"),
  };
}

function parseColor(value: unknown, label: string): string {
  if (typeof value !== "string" || !COLOR_PATTERN.test(value.trim())) {
    fail(`${label} must be a hex color like #a78bfa`);
  }
  return value.trim().toLowerCase();
}

const ICON_PLACEMENTS: EventIconPlacement[] = ["hero", "band", "meta", "manage"];

/** Placements are normalized to catalog order with duplicates dropped. */
function parseIcon(value: unknown): EventIcon {
  const raw = asRecord(value, "icon");
  const file = requiredText(raw.file, "icon file", 80);
  if (!RAID_ICONS.some((icon) => icon.file === file)) {
    fail(`"${file}" is not in the raid-icon catalog`);
  }
  const entries = raw.placements;
  if (!Array.isArray(entries)) fail("icon placements must be a list");
  for (const entry of entries) {
    // Derived from the list - a hand-written enum here already drifted once.
    if (!ICON_PLACEMENTS.includes(entry as EventIconPlacement)) {
      fail("icon placements must be hero, band, meta, or manage");
    }
  }
  const placements = ICON_PLACEMENTS.filter((placement) => entries.includes(placement));
  if (placements.length === 0) fail("the icon needs at least one placement");
  return { file, placements };
}

function parseInstant(value: unknown, label: string): string {
  if (typeof value !== "string" || !ZONED_PATTERN.test(value.trim()) || Number.isNaN(Date.parse(value))) {
    fail(`${label} must be an ISO instant with a timezone`);
  }
  return new Date(Date.parse(value)).toISOString();
}

const MAX_GOALS = 5;
const MAX_MILESTONES = 8;

/**
 * Reads the goals list; a legacy single `goal` with `target`/`unlock` is
 * accepted and normalized to one goal with one milestone, so stored rows
 * written before milestones keep validating.
 */
function parseGoals(raw: Record<string, unknown>): EventGoal[] | undefined {
  if (present(raw.goals)) {
    const entries = raw.goals;
    if (!Array.isArray(entries)) fail("goals must be a list");
    if (entries.length > MAX_GOALS) fail(`at most ${MAX_GOALS} goals are supported`);
    const goals = entries.map((entry, index) =>
      parseGoal(entry, entries.length === 1 ? "goal" : `goal ${index + 1}`),
    );
    return goals.length > 0 ? goals : undefined;
  }
  if (present(raw.goal)) return [parseGoal(raw.goal, "goal")];
  return undefined;
}

function parseGoal(value: unknown, label: string): EventGoal {
  const raw = asRecord(value, label);
  const goal: EventGoal = {
    metricLabel: requiredText(raw.metricLabel, `${label} metric`, 80),
    milestones: parseMilestones(raw, label),
  };
  if (present(raw.feed)) {
    if (raw.feed !== "raids" && raw.feed !== "raidRuns" && raw.feed !== "wars" && raw.feed !== "playtime") {
      fail(`${label} feed must be raids, raidRuns, wars, playtime, or empty`);
    }
    goal.feed = raw.feed;
  }
  const countRaid = optionalText(raw.countRaid, `${label} raid filter`, 80);
  if (countRaid) {
    if (goal.feed !== "raids" && goal.feed !== "raidRuns") {
      fail(`a ${label} raid filter needs a raid-based feed`);
    }
    goal.countRaid = countRaid;
  }
  if (present(raw.finalTotal)) goal.finalTotal = parseCount(raw.finalTotal, `${label} final total`, 0);
  return goal;
}

function parseMilestones(raw: Record<string, unknown>, label: string): EventGoal["milestones"] {
  // Legacy shape: one target, one unlock.
  if (!present(raw.milestones)) {
    return [
      {
        at: parseCount(raw.target, `${label} target`, 1),
        unlock: requiredText(raw.unlock, `${label} unlock`, 120),
      },
    ];
  }
  const entries = raw.milestones;
  if (!Array.isArray(entries) || entries.length === 0) {
    fail(`${label} needs at least one milestone`);
  }
  if (entries.length > MAX_MILESTONES) {
    fail(`${label} has too many milestones (max ${MAX_MILESTONES})`);
  }
  const milestones = entries.map((entry, index) => {
    const name = entries.length === 1 ? `${label} milestone` : `${label} milestone ${index + 1}`;
    const milestone = asRecord(entry, name);
    return {
      at: parseCount(milestone.at, `${name} target`, 1),
      unlock: requiredText(milestone.unlock, `${name} unlock`, 120),
    };
  });
  for (let index = 1; index < milestones.length; index++) {
    if (milestones[index].at <= milestones[index - 1].at) {
      fail(`${label} milestones must have ascending targets`);
    }
  }
  return milestones;
}

function parseActivity(value: unknown): NonNullable<GuildEvent["activity"]> {
  const raw = asRecord(value, "activity chart");
  if (raw.source !== "raids" && raw.source !== "raidRuns" && raw.source !== "none") {
    fail("activity chart source must be raids, raidRuns, or none");
  }
  const activity: NonNullable<GuildEvent["activity"]> = { source: raw.source };
  const countRaid = optionalText(raw.countRaid, "activity chart raid", 80);
  if (countRaid) {
    if (raw.source === "none") fail("an activity chart raid needs a raid-based source");
    activity.countRaid = countRaid;
  }
  return activity;
}

function parsePrize(value: unknown): PrizeEntry {
  const raw = asRecord(value, "prize");
  const donor = optionalText(raw.donor, "prize donor", 80);
  if (!donor) fail("each prize needs a donor");
  const prize = optionalText(raw.prize, "prize", 300);
  if (!prize) fail(`the prize from "${donor}" needs a description`);
  const entry: PrizeEntry = { donor, prize };
  const donorPlayer = optionalText(raw.donorPlayer, "donor player", 25);
  if (donorPlayer) entry.donorPlayer = donorPlayer;
  return entry;
}

function parseComp(value: unknown): NonNullable<GuildEvent["comp"]> {
  const raw = asRecord(value, "comp");
  const roles = parseList(raw.roles, "comp roles", parseRole);
  if (!roles) fail("comp needs at least one role");
  const comp: NonNullable<GuildEvent["comp"]> = { roles };
  const note = optionalText(raw.note, "comp note", 300);
  if (note) comp.note = note;
  return comp;
}

function parseRole(value: unknown): CompRole {
  const raw = asRecord(value, "comp role");
  const name = optionalText(raw.role, "role name", 60);
  if (!name) fail("each comp role needs a name");
  const builds = optionalText(raw.builds, "role builds", 200);
  if (!builds) fail(`the comp role "${name}" needs builds listed`);
  const role: CompRole = { role: name, builds };
  const note = optionalText(raw.note, "role note", 200);
  if (note) role.note = note;
  return role;
}

function parseTracker(value: unknown): NonNullable<GuildEvent["tracker"]> {
  const raw = asRecord(value, "tracker");
  if (raw.tracking !== "api" && raw.tracking !== "mod") fail("tracker tracking must be api or mod");
  return {
    eventId: requiredText(raw.eventId, "tracker event id", 64),
    tracking: raw.tracking,
  };
}

function parseLines(value: unknown, label: string, maxLength: number): string[] | undefined {
  if (!present(value)) return undefined;
  if (!Array.isArray(value)) fail(`${label} must be a list`);
  const lines = value.map((line) => requiredText(line, `${label} entry`, maxLength));
  return lines.length > 0 ? lines : undefined;
}

function parseList<T>(value: unknown, label: string, parse: (entry: unknown) => T): T[] | undefined {
  if (!present(value)) return undefined;
  if (!Array.isArray(value)) fail(`${label} must be a list`);
  if (value.length > 100) fail(`${label} has too many entries`);
  const entries = value.map(parse);
  return entries.length > 0 ? entries : undefined;
}

function parseCount(value: unknown, label: string, min: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    fail(`${label} must be a whole number of at least ${min}`);
  }
  return value;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") fail(`${label} is required`);
  const text = value.trim();
  if (text.length === 0) fail(`${label} is required`);
  if (text.length > maxLength) fail(`${label} is too long (max ${maxLength} characters)`);
  return text;
}

function optionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (!present(value)) return undefined;
  if (typeof value !== "string") fail(`${label} must be text`);
  const text = value.trim();
  if (text.length > maxLength) fail(`${label} is too long (max ${maxLength} characters)`);
  return text.length > 0 ? text : undefined;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${label} is malformed`);
  return value as Record<string, unknown>;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}
