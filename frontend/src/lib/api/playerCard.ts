export interface PlayerCharacterSummary {
  type: string;
  reskin: string | null;
  nickname: string | null;
  level: number;
  total_level: number;
  gamemodes: string[];
}

export interface PlayerCardResponse {
  generated_at: string;
  stale: boolean;
  username: string;
  uuid: string;
  online: boolean | null;
  server: string | null;
  support_rank: string | null;
  veteran: boolean;
  first_join: string | null;
  last_join: string | null;
  playtime: number | null;
  guild_name: string | null;
  guild_prefix: string | null;
  guild_rank: string | null;
  guild_rank_stars: string | null;
  wars: number | null;
  total_level: number | null;
  mobs_killed: number | null;
  chests_found: number | null;
  content_completion: number | null;
  quests: number | null;
  dungeons_total: number | null;
  dungeons: Record<string, number>;
  raids_total: number | null;
  raids: Record<string, number>;
  /**
   * Raids completed while in the player's current guild. Only the Wynncraft guild
   * endpoint reports it, so it is null for players read through the global profile
   * and for members whose profile hides their global data.
   */
  current_guild_raids: number | null;
  /**
   * When the player joined their current guild. Only the Wynncraft guild roster reports
   * it, so it is null for players read through the global profile.
   */
  guild_joined: string | null;
  pvp_kills: number | null;
  pvp_deaths: number | null;
  rankings: Record<string, number>;
  characters: PlayerCharacterSummary[];
}
