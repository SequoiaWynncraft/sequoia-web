import type { RankProfilesResponse } from "#lib/api/client.js";
import type { GuildMemberStats } from "#lib/api/guildStats.js";
import { sameUuid } from "#lib/server/raidEventBoards.js";
import type { Viewer } from "#lib/site/viewer.js";

const GATED_BRANCHES = ["development", "community"];

export function isBranchMemberViewer(
  profiles: RankProfilesResponse | null,
  roster: GuildMemberStats[] | null,
  viewer: Viewer | null,
): boolean {
  if (!viewer) return false;
  if (viewer.websiteAdmin) return true;
  if (roster === null || profiles === null) return false;
  const onRoster = roster.some(
    (member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid),
  );
  if (!onRoster) return false;
  const profile = profiles.profiles.find(
    (candidate) =>
      candidate.minecraft != null && sameUuid(candidate.minecraft.uuid, viewer.minecraftUuid),
  );
  return (
    profile?.summary.branches.some(
      (entry) => entry.level === "member" && GATED_BRANCHES.includes(entry.branch),
    ) ?? false
  );
}
