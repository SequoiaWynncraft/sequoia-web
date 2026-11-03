export const GUILD_RANKS = ["owner", "chief", "strategist", "captain", "recruiter", "recruit"] as const;

export type GuildRankName = (typeof GUILD_RANKS)[number];

export const GUILD_RANK_LABELS: Record<GuildRankName, string> = {
  owner: "Owner",
  chief: "Chief",
  strategist: "Strategist",
  captain: "Captain",
  recruiter: "Recruiter",
  recruit: "Recruit",
};

export function guildRankLabel(rank: string): string {
  return GUILD_RANK_LABELS[rank as GuildRankName] ?? rank;
}

/** Ladder position of an in-game rank - higher is more senior, owner highest. */
export function guildRankOrder(rank: GuildRankName): number {
  return GUILD_RANKS.length - 1 - GUILD_RANKS.indexOf(rank);
}

export interface GuildMemberStats {
  username: string;
  uuid: string | null;
  rank: GuildRankName;
  online: boolean | null;
  server: string | null;
  contributed: number;
  contribution_rank: number;
  joined: string | null;
  last_join: string | null;
  playtime: number | null;
  wars: number | null;
  raids_total: number | null;
  raids: Record<string, number>;
  dungeons_total: number | null;
  total_level: number | null;
  quests: number | null;
}

export interface GuildSeasonRank {
  season: number;
  rating: number;
  final_territories: number;
}

export interface GuildMeta {
  name: string;
  prefix: string;
  level: number;
  xp_percent: number;
  territories: number;
  wars: number;
  raids: number;
  created: string | null;
  online_now: number;
  members_total: number;
}

export interface GuildStatsResponse {
  generated_at: string;
  stale: boolean;
  guild: GuildMeta;
  season_ranks: GuildSeasonRank[];
  rankings: Record<string, number>;
  members: GuildMemberStats[];
}
