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

export interface EventGoal {
  /** What is being counted, e.g. "guild raids". */
  metricLabel: string;
  target: number;
  /** What reaching the target unlocks, e.g. "Rank Up Raffle". */
  unlock: string;
  /**
   * Data source for live progress and the activity chart. "raids" reads the
   * public guild-raid activity feed; absent means no live wiring exists yet
   * (the meter shows finalTotal or a dash).
   */
  feed?: "raids";
  /**
   * Count only this raid's clears; absent counts all guild raids.
   * Must match a Wynncraft raid name from the activity feed.
   */
  countRaid?: string;
  /** Frozen total for ended events - live events read the activity feed. */
  finalTotal?: number;
}

export interface PrizeEntry {
  donor: string;
  prize: string;
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
  goal?: EventGoal;
  prizes?: PrizeEntry[];
  prizesNote?: string;
  comp?: { roles: CompRole[]; note?: string };
  rules?: string[];
  /** Raid-tracker window powering the member standings board. */
  tracker?: { eventId: string; tracking: "api" | "mod" };
}
