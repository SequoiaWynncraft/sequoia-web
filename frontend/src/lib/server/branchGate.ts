import type { RankProfilesResponse } from "#lib/api/client.js";
import type { GuildMemberStats } from "#lib/api/guildStats.js";
import { sameUuid } from "#lib/server/raidEventBoards.js";
import type { Viewer } from "#lib/site/viewer.js";

/** Branch ids (`RankSummary.branches[].branch`) whose full members may see the
 * gated management sections. These are stable backend ids, not Discord display
 * labels, so renaming a role cannot open or close the gate. Trainees are
 * excluded. */
export const GATED_BRANCHES = ["development", "community"];

/**
 * Returns whether the viewer is a website administrator, or a full member
 * (not a trainee) of the Development or Community branch who is also still on
 * the guild roster. Anonymous viewers are denied.
 *
 * The roster half matters: the sections behind this gate carry per-member
 * tracker data and staff payout text, and a Discord branch role outlives
 * leaving the guild.
 *
 * Non-administrator callers must read both `profiles` and `roster` fresh and
 * refuse a stale copy of either. Administrator access comes from the verified
 * session and therefore does not depend on either snapshot.
 */
export function isBranchMemberViewer(
  profiles: RankProfilesResponse | null,
  roster: GuildMemberStats[] | null,
  viewer: Viewer | null,
): boolean {
  if (!viewer) return false;
  // Website administrators are the application-wide guild-member override.
  // Their grant comes from the verified session, not either guild snapshot.
  if (viewer.websiteAdmin) return true;
  if (roster === null || profiles === null) return false;
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
