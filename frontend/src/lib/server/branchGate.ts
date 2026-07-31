import type { RankProfilesResponse } from "$lib/api/client";
import type { GuildMemberStats } from "$lib/api/guildStats";
import { sameUuid } from "$lib/server/raidEventBoards";
import type { Viewer } from "$lib/site/viewer";

/** Branch ids (`RankSummary.branches[].branch`) whose full members may see the
 * gated management sections. These are stable backend ids, not Discord display
 * labels, so renaming a role cannot open or close the gate. Trainees are
 * excluded. */
export const GATED_BRANCHES = ["development", "community"];

/**
 * Returns whether the viewer is a full member (not a trainee) of the
 * Development or Community branch who is also still on the guild roster.
 * Anonymous viewers are denied.
 *
 * The roster half matters: the sections behind this gate carry per-member
 * tracker data and staff payout text, and a Discord branch role outlives
 * leaving the guild.
 *
 * Callers must read both `profiles` and `roster` fresh and refuse to use a
 * stale copy of either - a cached roster or profile outlives the revocation
 * that removed the viewer, so authorizing from one would keep serving them
 * through an upstream outage.
 */
export function isBranchMemberViewer(
  profiles: RankProfilesResponse,
  roster: GuildMemberStats[],
  viewer: Viewer | null,
): boolean {
  if (!viewer) return false;
  const onRoster = roster.some(
    (member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid),
  );
  if (!onRoster) return false;
  // `sameUuid` on both halves deliberately: the roster and the rank API do not
  // agree on dashes, and a raw comparison here would deny every eligible member
  // the moment either side changed format.
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
