import { dayGap, toLevelUps, type GuildLevelTracker, type GuildLevelUp } from "#lib/api/guildLevel.js";
import { isBranchMemberViewer } from "#lib/server/branchGate.js";
import { getGuildStats } from "#lib/server/guildStats.js";
import { getGuildLevelHistory } from "#lib/server/guildLevelHistory.js";
import { getLinkedRankProfilesResult } from "#lib/server/rankProfiles.js";
import type { Viewer } from "#lib/site/viewer.js";

const PAYOUT_ROLE_ID = "1030198924323078194";
const PAYOUT_CONTACT_IDS = [
  "420289176421007360",
  "581255561941614607",
  "894980597557100554",
  "261115988831895552",
  "366506301544726528",
];

const PAYOUT_RATE = "0.5LE per raid";

export function buildPayoutText(history: GuildLevelUp[]): string | null {
  const [last, previous] = history;
  if (!last || !previous) return null;
  const days = dayGap(previous.observedAt, last.observedAt);
  const contacts = PAYOUT_CONTACT_IDS.map((id) => `<@${id}>`);
  const contactList = `${contacts.slice(0, -1).join(", ")} or ${contacts.at(-1)}`;
  return `# Level ${last.level} Reached!
${days} days
<@&${PAYOUT_ROLE_ID}> please contact me, ${contactList} for your payout

${PAYOUT_RATE}`;
}

export async function loadGuildLevelTracker(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<GuildLevelTracker | null> {
  if (!viewer) return null;
  try {
    const [stats, profiles] = await Promise.all([
      getGuildStats(fetchImpl, { allowStale: viewer.websiteAdmin }),
      viewer.websiteAdmin
        ? Promise.resolve(null)
        : getLinkedRankProfilesResult(fetchImpl, { allowStale: false }),
    ]);
    if (!viewer.websiteAdmin && (stats.stale || profiles === null || profiles.stale)) {
      console.warn("guild level tracker: gate reads are stale, denying");
      return null;
    }
    if (!isBranchMemberViewer(profiles?.data ?? null, stats.members, viewer)) return null;

    const historyResponse = await getGuildLevelHistory(fetchImpl);
    if (!historyResponse) return null;
    const history = toLevelUps(historyResponse.entries);

    return {
      current: {
        level: stats.guild.level,
        xpPercent: stats.guild.xp_percent,
        observedAt: stats.generated_at,
      },
      history,
      payoutText: buildPayoutText(history),
    };
  } catch (error) {
    console.warn("guild level tracker unavailable:", error);
    return null;
  }
}
