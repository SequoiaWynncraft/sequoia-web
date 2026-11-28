import type { GuildRankName } from "#lib/api/guildStats.js";

export type EventAccess = "public" | "members";

export type EventStatus = "tba" | "upcoming" | "live" | "ended";

export type TrackerKind = "api" | "mod" | "wars";

export type StandingsUnit = "raids" | "war points";

export function standingsUnit(tracking: TrackerKind | undefined): StandingsUnit {
  return tracking === "wars" ? "war points" : "raids";
}

export interface EventTheme {
  sky: [string, string];
  accent: string;
  accentSecondary: string;
  star: string;
}

export type EventIconPlacement = "hero" | "band" | "meta" | "manage";

export interface EventIcon {
  file: string;
  placements: EventIconPlacement[];
}

export interface GoalMilestone {
  at: number;
  unlock: string;
  label?: string;
}

export interface PersonalMilestone {
  id: string;
  at: number;
  unlock: string;
}

export interface EventGoal {
  metricLabel: string;
  milestones: GoalMilestone[];
  feed?: "raids" | "raidRuns" | "warPoints" | "wars" | "playtime";
  countRaid?: string;
  finalTotal?: number;
  milestoneStyle?: "list" | "markers" | "both" | "none";
}

export interface PrizeEntry {
  donor: string;
  prize: string;
  donorPlayer?: string;
}

export interface CompRole {
  role: string;
  builds: string;
  note?: string;
}

export interface RaffleWinner {
  slot: number;
  username: string;
  player_uuid: string;
  tickets: number;
  source?: "drawn" | "manual";
}

export interface ManualEntrant {
  player_uuid: string;
  username: string;
  tickets?: number;
}

export type EligibilityRule =
  | { type: "guildRank"; ranks: GuildRankName[] }
  | { type: "seqRank"; ranks: string[] }
  | {
      type: "stat";
      stat: "raids" | "playtime" | "wars";
      min: number;
      window: { from: string; to: string };
      source?: "rollups" | "tracker";
    }
  | { type: "milestone"; milestoneId: string };

export type TicketWeight =
  | { mode: "flat" }
  | { mode: "perRaid"; perTicket: number; window?: { from: string; to: string } }
  | {
      mode: "perStat";
      stat: "raids" | "playtime" | "wars";
      per: number;
      window: { from: string; to: string };
    };

export interface RaffleEligibility {
  whitelistOnly?: boolean;
  include?: ManualEntrant[];
  exclude?: ManualEntrant[];
  rules?: EligibilityRule[];
  weight?: TicketWeight;
}

export interface EventRaffle {
  id: string;
  prize: string;
  winnerCount: number;
  icon?: string;
  wheelStyle?: "heads" | "names";
  perTicket: number;
  window?: { from: string; to: string };
  winners?: RaffleWinner[];
  drawnAt?: string;
  requiresMilestone?: string;
  eligibility?: RaffleEligibility;
}

export interface GuildEvent {
  slug: string;
  name: string;
  tagline: string;
  access: EventAccess;
  theme: EventTheme;
  icon?: EventIcon;
  startsAt?: string;
  endsAt?: string;
  about?: string[];
  goals?: EventGoal[];
  personalMilestones?: PersonalMilestone[];
  activity?: { source: "raids" | "raidRuns" | "none"; countRaid?: string };
  prizes?: PrizeEntry[];
  prizesNote?: string;
  comp?: { roles: CompRole[]; note?: string };
  rules?: string[];
  tracker?: { eventId: string; tracking: TrackerKind };
  raffles?: EventRaffle[];
  raffleExcludeWinners?: boolean;
  raffleHideWheel?: boolean;
}
