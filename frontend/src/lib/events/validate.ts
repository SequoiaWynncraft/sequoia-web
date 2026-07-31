import { GUILD_RANKS, type GuildRankName } from "$lib/api/guildStats";

import { RAID_ICONS } from "./raidIcons";
import type {
  CompRole,
  EligibilityRule,
  EventGoal,
  EventIcon,
  EventIconPlacement,
  EventRaffle,
  EventTheme,
  GuildEvent,
  ManualEntrant,
  PersonalMilestone,
  PrizeEntry,
  RaffleEligibility,
  RaffleWinner,
  TicketWeight,
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
  const personalMilestones = parsePersonalMilestones(raw);
  if (personalMilestones) event.personalMilestones = personalMilestones;
  if (present(raw.activity)) event.activity = parseActivity(raw.activity);
  const prizes = parseList(raw.prizes, "prizes", parsePrize);
  if (prizes) event.prizes = prizes;
  const prizesNote = optionalText(raw.prizesNote, "prizes note", 500);
  if (prizesNote) event.prizesNote = prizesNote;
  if (present(raw.comp)) event.comp = parseComp(raw.comp);
  const rules = parseLines(raw.rules, "rules", 500);
  if (rules) event.rules = rules;
  if (present(raw.tracker)) event.tracker = parseTracker(raw.tracker);
  const raffles = parseRaffles(raw);
  if (raffles) {
    event.raffles = raffles;
    // A raffle gate must point at a real personal milestone: a dangling id would
    // silently never let anyone in. Checked here, where both lists are resolved.
    const milestoneIds = new Set((personalMilestones ?? []).map((milestone) => milestone.id));
    for (const raffle of raffles) {
      if (raffle.requiresMilestone !== undefined && !milestoneIds.has(raffle.requiresMilestone)) {
        fail(`raffle "${raffle.prize}" requires a personal milestone that does not exist`);
      }
      for (const rule of raffle.eligibility?.rules ?? []) {
        if (rule.type === "milestone" && !milestoneIds.has(rule.milestoneId)) {
          fail(`raffle "${raffle.prize}" filters on a personal milestone that does not exist`);
        }
      }
    }
  }
  if (raw.raffleExcludeWinners === true) {
    event.raffleExcludeWinners = true;
    // With exclusion on, every raffle shares one winner pool - a member may hold
    // at most one winning slot across the whole event. Reject a uuid that already
    // won another raffle so a stale form or hand-edited preset can't slip past.
    const across = new Set<string>();
    for (const raffle of raffles ?? []) {
      for (const winner of raffle.winners ?? []) {
        if (across.has(winner.player_uuid)) fail("a member cannot win more than one raffle");
        across.add(winner.player_uuid);
      }
    }
  }
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

export const ICON_PLACEMENTS: EventIconPlacement[] = ["hero", "band", "meta", "manage"];

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
  if (present(raw.milestoneStyle)) {
    if (
      raw.milestoneStyle !== "list" &&
      raw.milestoneStyle !== "markers" &&
      raw.milestoneStyle !== "both" &&
      raw.milestoneStyle !== "none"
    ) {
      fail(`${label} milestone style must be list, markers, both, or none`);
    }
    goal.milestoneStyle = raw.milestoneStyle;
  }
  return goal;
}

/** Markers sit inside the meter's width; long text would collide with neighbors. */
const MAX_MILESTONE_LABEL = 24;

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
    const parsed: EventGoal["milestones"][number] = {
      at: parseCount(milestone.at, `${name} target`, 1),
      unlock: requiredText(milestone.unlock, `${name} unlock`, 120),
    };
    const markerLabel = optionalText(milestone.label, `${name} marker label`, MAX_MILESTONE_LABEL);
    if (markerLabel) parsed.label = markerLabel;
    return parsed;
  });
  for (let index = 1; index < milestones.length; index++) {
    if (milestones[index].at <= milestones[index - 1].at) {
      fail(`${label} milestones must have ascending targets`);
    }
  }
  return milestones;
}

const MAX_PERSONAL_MILESTONES = 8;

/**
 * Reads the optional personal-milestones list: per-member raid thresholds with
 * stable ids (targeted by raffle gates), strictly ascending targets, and unique
 * ids. An empty or absent list yields undefined.
 */
function parsePersonalMilestones(raw: Record<string, unknown>): PersonalMilestone[] | undefined {
  if (!present(raw.personalMilestones)) return undefined;
  const entries = raw.personalMilestones;
  if (!Array.isArray(entries)) fail("personal milestones must be a list");
  if (entries.length > MAX_PERSONAL_MILESTONES) {
    fail(`at most ${MAX_PERSONAL_MILESTONES} personal milestones are supported`);
  }
  const milestones = entries.map((entry, index) => {
    const name = entries.length === 1 ? "personal milestone" : `personal milestone ${index + 1}`;
    const milestone = asRecord(entry, name);
    return {
      id: requiredText(milestone.id, `${name} id`, 64),
      at: parseCount(milestone.at, `${name} target`, 1),
      unlock: requiredText(milestone.unlock, `${name} unlock`, 120),
    };
  });
  if (milestones.length === 0) return undefined;
  const ids = new Set<string>();
  for (const milestone of milestones) {
    if (ids.has(milestone.id)) fail("personal milestone ids must be unique");
    ids.add(milestone.id);
  }
  for (let index = 1; index < milestones.length; index++) {
    if (milestones[index].at <= milestones[index - 1].at) {
      fail("personal milestones must have ascending targets");
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

const MAX_RAFFLES = 50;
const MAX_RAFFLE_WINNERS = 50;

/** Reads the optional raffles list, capped and each strictly validated. */
function parseRaffles(raw: Record<string, unknown>): EventRaffle[] | undefined {
  if (!present(raw.raffles)) return undefined;
  const entries = raw.raffles;
  if (!Array.isArray(entries)) fail("raffles must be a list");
  if (entries.length > MAX_RAFFLES) fail(`at most ${MAX_RAFFLES} raffles are supported`);
  const raffles = entries.map((entry, index) =>
    parseRaffle(entry, entries.length === 1 ? "raffle" : `raffle ${index + 1}`),
  );
  // Ids target rolls and re-rolls, so a collision would make one raffle
  // unreachable behind the other.
  const ids = new Set<string>();
  for (const raffle of raffles) {
    if (ids.has(raffle.id)) fail("raffle ids must be unique");
    ids.add(raffle.id);
  }
  return raffles.length > 0 ? raffles : undefined;
}

function parseRaffle(value: unknown, label: string): EventRaffle {
  const raw = asRecord(value, label);
  const raffle: EventRaffle = {
    id: requiredText(raw.id, `${label} id`, 64),
    prize: requiredText(raw.prize, `${label} prize`, 300),
    winnerCount: parseCount(raw.winnerCount, `${label} winner count`, 1),
    perTicket: parseCount(raw.perTicket, `${label} raids per ticket`, 1),
  };
  if (raffle.winnerCount > MAX_RAFFLE_WINNERS) {
    fail(`${label} has too many winners (max ${MAX_RAFFLE_WINNERS})`);
  }
  if (present(raw.window)) raffle.window = parseRaffleWindow(raw.window, label);
  if (present(raw.winners)) {
    const winners = parseList(raw.winners, `${label} winners`, (entry) =>
      parseRaffleWinner(entry, label),
    );
    if (winners) {
      // One winner per slot, every slot inside the declared count - keeps the
      // public board (which renders one row per slot) from hiding a persisted
      // winner or double-booking a slot.
      const slots = new Set<number>();
      const players = new Set<string>();
      for (const winner of winners) {
        if (winner.slot >= raffle.winnerCount) fail(`${label} winner slot is out of range`);
        if (slots.has(winner.slot)) fail(`${label} has two winners in the same slot`);
        if (players.has(winner.player_uuid)) fail(`${label} lists the same player twice`);
        slots.add(winner.slot);
        players.add(winner.player_uuid);
      }
      raffle.winners = winners;
    }
  }
  if (present(raw.drawnAt)) raffle.drawnAt = parseInstant(raw.drawnAt, `${label} draw time`);
  const requiresMilestone = optionalText(raw.requiresMilestone, `${label} milestone gate`, 64);
  // The referenced id is cross-checked against personalMilestones in parseEvent.
  if (requiresMilestone) raffle.requiresMilestone = requiresMilestone;
  if (present(raw.eligibility)) raffle.eligibility = parseEligibility(raw.eligibility, label);
  return raffle;
}

const MAX_MANUAL_ENTRANTS = 150;
const MAX_MANUAL_TICKETS = 1_000_000;
const MAX_ELIGIBILITY_RULES = 20;
const ELIGIBILITY_STATS = new Set(["raids", "playtime", "wars"]);

function parseEligibility(value: unknown, label: string): RaffleEligibility {
  const raw = asRecord(value, `${label} eligibility`);
  const eligibility: RaffleEligibility = {};
  const include = parseManualEntrants(raw.include, `${label} include list`);
  if (include) eligibility.include = include;
  const exclude = parseManualEntrants(raw.exclude, `${label} exclude list`);
  if (exclude) eligibility.exclude = exclude;
  if (present(raw.rules)) {
    if (!Array.isArray(raw.rules)) fail(`${label} rules must be a list`);
    if (raw.rules.length > MAX_ELIGIBILITY_RULES) {
      fail(`${label} has too many rules (max ${MAX_ELIGIBILITY_RULES})`);
    }
    const rules = raw.rules.map((entry) => parseEligibilityRule(entry, label));
    if (rules.length > 0) eligibility.rules = rules;
  }
  if (present(raw.weight)) eligibility.weight = parseTicketWeight(raw.weight, label);
  return eligibility;
}

function parseManualEntrants(value: unknown, label: string): ManualEntrant[] | undefined {
  if (!present(value)) return undefined;
  if (!Array.isArray(value)) fail(`${label} must be a list`);
  if (value.length > MAX_MANUAL_ENTRANTS) {
    fail(`${label} has too many entries (max ${MAX_MANUAL_ENTRANTS})`);
  }
  const seen = new Set<string>();
  const entries = value.map((entry) => {
    const raw = asRecord(entry, `${label} entry`);
    const entrant: ManualEntrant = {
      player_uuid: requiredText(raw.player_uuid, `${label} entry uuid`, 64),
      username: requiredText(raw.username, `${label} entry name`, 40),
    };
    const key = entrant.player_uuid.replaceAll("-", "").toLowerCase();
    if (seen.has(key)) fail(`${label} lists the same player twice`);
    seen.add(key);
    if (present(raw.tickets)) {
      entrant.tickets = parseCount(raw.tickets, `${label} entry tickets`, 1);
      // Huge floors pass Number.isInteger (1e308 is "an integer") and would
      // overflow the draw's ticket sum to Infinity, breaking the weighting.
      if (entrant.tickets > MAX_MANUAL_TICKETS) {
        fail(`${label} entry tickets must be at most ${MAX_MANUAL_TICKETS}`);
      }
    }
    return entrant;
  });
  return entries.length > 0 ? entries : undefined;
}

function parseEligibilityRule(value: unknown, label: string): EligibilityRule {
  const raw = asRecord(value, `${label} rule`);
  switch (raw.type) {
    case "guildRank": {
      const ranks = parseRankList(raw.ranks, `${label} guild-rank rule`, (rank) =>
        (GUILD_RANKS as readonly string[]).includes(rank),
      );
      return { type: "guildRank", ranks: ranks as GuildRankName[] };
    }
    case "seqRank": {
      const ranks = parseRankList(raw.ranks, `${label} Sequoia-rank rule`, () => true);
      return { type: "seqRank", ranks };
    }
    case "stat": {
      if (typeof raw.stat !== "string" || !ELIGIBILITY_STATS.has(raw.stat)) {
        fail(`${label} stat rule must count raids, playtime, or wars`);
      }
      return {
        type: "stat",
        stat: raw.stat as "raids" | "playtime" | "wars",
        min: parseCount(raw.min, `${label} stat rule minimum`, 1),
        window: parseDayWindow(raw.window, `${label} stat rule`),
      };
    }
    case "milestone":
      // The referenced id is cross-checked against personalMilestones in parseEvent.
      return { type: "milestone", milestoneId: requiredText(raw.milestoneId, `${label} milestone rule`, 64) };
    default:
      fail(`${label} has a rule of unknown type`);
  }
}

function parseRankList(
  value: unknown,
  label: string,
  valid: (rank: string) => boolean,
): string[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} needs at least one rank`);
  if (value.length > MAX_ELIGIBILITY_RULES) fail(`${label} lists too many ranks`);
  const ranks = value.map((rank) => {
    const text = requiredText(rank, `${label} rank`, 40);
    if (!valid(text)) fail(`${label} names an unknown rank`);
    return text;
  });
  if (new Set(ranks).size !== ranks.length) fail(`${label} lists the same rank twice`);
  return ranks;
}

function parseTicketWeight(value: unknown, label: string): TicketWeight {
  const raw = asRecord(value, `${label} weight`);
  switch (raw.mode) {
    case "flat":
      return { mode: "flat" };
    case "perRaid": {
      const weight: TicketWeight = {
        mode: "perRaid",
        perTicket: parseCount(raw.perTicket, `${label} raids per ticket`, 1),
      };
      if (present(raw.window)) weight.window = parseRaffleWindow(raw.window, `${label} weight`);
      return weight;
    }
    case "perStat": {
      if (typeof raw.stat !== "string" || !ELIGIBILITY_STATS.has(raw.stat)) {
        fail(`${label} weight must count raids, playtime, or wars`);
      }
      return {
        mode: "perStat",
        stat: raw.stat as "raids" | "playtime" | "wars",
        per: parseCount(raw.per, `${label} per-stat divisor`, 1),
        window: parseDayWindow(raw.window, `${label} weight`),
      };
    }
    default:
      fail(`${label} has a weight of unknown mode`);
  }
}

/**
 * Stat windows read the daily rollups, which only exist in whole UTC days: a
 * partial-day bound would silently expand to the full days it touches, so
 * both bounds must sit exactly on UTC midnight. The member-progress backend
 * serves at most 400 inclusive days, so longer windows must fail before save.
 */
function parseDayWindow(value: unknown, label: string): NonNullable<EventRaffle["window"]> {
  const window = parseRaffleWindow(value, label, true);
  for (const bound of [window.from, window.to]) {
    if (!bound.endsWith("T00:00:00.000Z")) {
      fail(`${label} window counts whole UTC days - both bounds must be UTC midnight`);
    }
  }
  const inclusiveDays = (Date.parse(window.to) - Date.parse(window.from)) / 86_400_000 + 1;
  if (inclusiveDays > 400) fail(`${label} window must span at most 400 inclusive days`);
  return window;
}

function parseRaffleWindow(
  value: unknown,
  label: string,
  allowEqual = false,
): NonNullable<EventRaffle["window"]> {
  const raw = asRecord(value, `${label} window`);
  const from = parseInstant(raw.from, `${label} window start`);
  const to = parseInstant(raw.to, `${label} window end`);
  const invalidOrder = allowEqual ? Date.parse(from) > Date.parse(to) : Date.parse(from) >= Date.parse(to);
  if (invalidOrder) {
    fail(`${label} window must end after it starts`);
  }
  return { from, to };
}

function parseRaffleWinner(value: unknown, label: string): RaffleWinner {
  const raw = asRecord(value, `${label} winner`);
  if (present(raw.source) && raw.source !== "drawn" && raw.source !== "manual") {
    fail(`${label} winner has an unknown source`);
  }
  const source = raw.source === "manual" ? "manual" : undefined;
  const winner: RaffleWinner = {
    slot: parseCount(raw.slot, `${label} winner slot`, 0),
    username: requiredText(raw.username, `${label} winner name`, 40),
    player_uuid: requiredText(raw.player_uuid, `${label} winner uuid`, 64),
    // A drawn winner came from the ticket-weighted pool, where zero-ticket
    // entrants never win - so it holds at least one. A hand-picked winner
    // may hold zero, since no draw produced it.
    tickets: parseCount(raw.tickets, `${label} winner tickets`, source === "manual" ? 0 : 1),
  };
  if (source) winner.source = source;
  return winner;
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
