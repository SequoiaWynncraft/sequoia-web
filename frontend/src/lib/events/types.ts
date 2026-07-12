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

export interface GoalMilestone {
  /** Metric value at which this unlock triggers. */
  at: number;
  /** What reaching it unlocks, e.g. "Rank Up Raffle". */
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

export interface GuildEvent {
  slug: string;
  name: string;
  tagline: string;
  access: EventAccess;
  theme: EventTheme;
  /** RFC3339 instants; both absent means dates are TBA. */
  startsAt?: string;
  endsAt?: string;
  /** Short paragraphs shown under the hero. */
  about?: string[];
  /** Tracked goals, each with its own data source and milestone unlocks. */
  goals?: EventGoal[];
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
}
