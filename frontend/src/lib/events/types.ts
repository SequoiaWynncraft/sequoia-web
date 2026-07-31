import type { GuildRankName } from "$lib/api/guildStats";

export type EventAccess = "public" | "members";

export type EventStatus = "tba" | "upcoming" | "live" | "ended";

/** Per-event visual identity, applied as CSS custom properties on the event's sky. */
export interface EventTheme {
  /** Backdrop gradient, top to bottom. */
  sky: [string, string];
  /** Structural accent: section sparks, meter fill, chips, chart marks. */
  accent: string;
  /** Second stop of the event-name gradient. */
  accentSecondary: string;
  /** Star speck color in the backdrop. */
  star: string;
}

/** Where an event's icon appears; the editor picks any subset. */
export type EventIconPlacement = "hero" | "band" | "meta" | "manage";

export interface EventIcon {
  /** File name from the raid-icon catalog. */
  file: string;
  /** At least one placement; hero is the editor default. */
  placements: EventIconPlacement[];
}

export interface GoalMilestone {
  /** Metric value at which this unlock triggers. */
  at: number;
  /** What reaching it unlocks, e.g. "Rank Up Raffle". */
  unlock: string;
  /**
   * Short text shown at this milestone's position under the meter when the
   * goal renders markers, e.g. "1.3x". Absent falls back to the target count.
   */
  label?: string;
}

/**
 * A per-member raid threshold reached individually on the standings board,
 * distinct from the guild-wide GoalMilestone. Members see their own progress
 * on the event page, and raffles can gate entry on reaching one.
 */
export interface PersonalMilestone {
  /** Stable id used to target raffle gates; persists in the event JSON. */
  id: string;
  /** Raid count a member must personally reach on the tracker's standings board. */
  at: number;
  /** What reaching it represents, e.g. "Rank Up eligibility". */
  unlock: string;
}

export interface EventGoal {
  /** What is being counted, e.g. "guild raids". */
  metricLabel: string;
  /** Unlock tiers in strictly ascending order; the last one is the headline target. */
  milestones: GoalMilestone[];
  /**
   * Live data source for the meter. "raids" reads the public guild-raid
   * activity feed (member participation credits - party size inflates them),
   * "raidRuns" counts unique completions from the guild mod's log (one per
   * run, but only runs a mod user was in), "wars" and "playtime" sum the
   * daily stat rollups; absent means manual (finalTotal or a dash).
   */
  feed?: "raids" | "raidRuns" | "wars" | "playtime";
  /**
   * Count only this raid (raid-based feeds only); absent counts all guild
   * raids. Must match a Wynncraft raid name.
   */
  countRaid?: string;
  /** Frozen total for ended events - live events read the activity feed. */
  finalTotal?: number;
  /**
   * How milestones annotate the full-size meter (the band strip always keeps
   * its one-line summary):
   * - "list" (default): the ✦ unlock list below the meter
   * - "markers": waypoint nodes under the track at each milestone's position,
   *   short labels always visible, full unlock text on hover/focus/tap
   * - "both": markers and the list
   * - "none": bare ticks only
   */
  milestoneStyle?: "list" | "markers" | "both" | "none";
}

export interface PrizeEntry {
  /** Display name for the donor - free text, often a nickname. */
  donor: string;
  prize: string;
  /** Minecraft username; when set, the donor links to that playercard. */
  donorPlayer?: string;
}

export interface CompRole {
  role: string;
  builds: string;
  note?: string;
}

/** A single drawn raffle winner, frozen onto its slot at roll time. */
export interface RaffleWinner {
  /** Which winner slot (0-based) this fills; slots are rolled independently. */
  slot: number;
  username: string;
  player_uuid: string;
  /** Ticket count the winner held when drawn - kept for display and audit. */
  tickets: number;
  /** How the slot was filled; absent means "drawn" (every pre-existing row). */
  source?: "drawn" | "manual";
}

/** A hand-picked raffle entrant, stored with identity so the pick survives roster churn. */
export interface ManualEntrant {
  player_uuid: string;
  username: string;
  /** Ticket floor for include entries; absent means 1. Ignored on excludes. */
  tickets?: number;
}

/**
 * One eligibility filter; a raffle's rules are AND-composed over the fresh
 * roster. Stat rules read the daily rollups, so their windows count whole
 * UTC days.
 */
export type EligibilityRule =
  | { type: "guildRank"; ranks: GuildRankName[] }
  | { type: "seqRank"; ranks: string[] }
  | {
      type: "stat";
      stat: "raids" | "playtime" | "wars";
      min: number;
      window: { from: string; to: string };
    }
  | { type: "milestone"; milestoneId: string };

/** How surviving entrants are weighted into tickets. */
export type TicketWeight =
  | { mode: "flat" }
  | { mode: "perRaid"; perTicket: number; window?: { from: string; to: string } }
  | {
      mode: "perStat";
      stat: "raids" | "playtime" | "wars";
      per: number;
      window: { from: string; to: string };
    };

/**
 * Composable raffle eligibility. The pool starts from the fresh roster,
 * `rules` filter it (AND), `include` pins entrants past the rules,
 * `exclude` beats everything, and `weight` converts survivors to tickets
 * (default flat: one each). Absent entirely, the raffle keeps the legacy
 * semantics driven by `perTicket`/`window`/`requiresMilestone`.
 */
export interface RaffleEligibility {
  /** The include list IS the pool: rules and the roster base don't apply,
   * only whitelisted members enter (weighted as usual, excludes still win). */
  whitelistOnly?: boolean;
  include?: ManualEntrant[];
  exclude?: ManualEntrant[];
  rules?: EligibilityRule[];
  weight?: TicketWeight;
}

/**
 * A prize draw whose entries come from the event tracker's raid board:
 * `perTicket` raids inside `window` earn one weighted ticket. Winners are
 * frozen when a manager rolls, so the public page never recomputes them.
 */
export interface EventRaffle {
  /** Stable id used to target rolls and re-rolls; persists in the event JSON. */
  id: string;
  /** One prize per raffle - create several raffles for several items. */
  prize: string;
  /** How many distinct winners to draw. */
  winnerCount: number;
  /** Curated prize art (file from PRIZE_ICONS); display-only. */
  icon?: string;
  /** What identifies entrants on the stage wheel; default "heads". */
  wheelStyle?: "heads" | "names";
  /** Raids per ticket: entrants earn floor(raids / perTicket) weighted tickets. */
  perTicket: number;
  /** Ticket-earning window (RFC3339); absent uses the tracker's full window. */
  window?: { from: string; to: string };
  /** Frozen winners keyed by slot; a slot with no entry is not yet drawn. */
  winners?: RaffleWinner[];
  /** RFC3339 instant of the most recent slot roll. */
  drawnAt?: string;
  /**
   * When set, only members who reached this PersonalMilestone (by its id) over
   * the full event standings window may enter this raffle.
   */
  requiresMilestone?: string;
  /**
   * Composable pool definition; when present it fully decides who enters and
   * with how many tickets, and the legacy fields above only remain as the
   * rollback mirror (the editor keeps `perTicket` in sync where it can).
   */
  eligibility?: RaffleEligibility;
}

export interface GuildEvent {
  slug: string;
  name: string;
  tagline: string;
  access: EventAccess;
  theme: EventTheme;
  /** Raid icon shown at the chosen placements; absent shows none. */
  icon?: EventIcon;
  /** RFC3339 instants; both absent means dates are TBA. */
  startsAt?: string;
  endsAt?: string;
  /** Short paragraphs shown under the hero. */
  about?: string[];
  /** Tracked goals, each with its own data source and milestone unlocks. */
  goals?: EventGoal[];
  /**
   * Per-member raid milestones, in strictly ascending order by `at`, shown on
   * the standings board; a raffle may gate entry on one. Meaningful only with a
   * tracker configured, since progress reads the tracker's standings board.
   */
  personalMilestones?: PersonalMilestone[];
  /**
   * Activity chart configuration. Absent follows the first goal reading a
   * raid-based feed; "none" hides the chart; countRaid narrows to one raid.
   * "raids" charts participation credits, "raidRuns" charts unique mod-logged
   * runs; wars and playtime have no daily feed.
   */
  activity?: { source: "raids" | "raidRuns" | "none"; countRaid?: string };
  prizes?: PrizeEntry[];
  prizesNote?: string;
  comp?: { roles: CompRole[]; note?: string };
  rules?: string[];
  /** Raid-tracker window powering the member standings board. */
  tracker?: { eventId: string; tracking: "api" | "mod" };
  /** Prize draws earning tickets from the tracker's raid board. */
  raffles?: EventRaffle[];
  /** When set, a winner of any raffle is excluded from the rest of this event. */
  raffleExcludeWinners?: boolean;
}
