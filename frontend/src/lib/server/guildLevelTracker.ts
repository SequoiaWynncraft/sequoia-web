import { dayGap, toLevelUps, type GuildLevelTracker, type GuildLevelUp } from "$lib/api/guildLevel";
import { isBranchMemberViewer } from "$lib/server/branchGate";
import { getGuildStats } from "$lib/server/guildStats";
import { getGuildLevelHistory } from "$lib/server/guildLevelHistory";
import { getLinkedRankProfilesResult } from "$lib/server/rankProfiles";
import type { Viewer } from "$lib/site/viewer";

/**
 * Discord ids pinged by the payout message, reproduced from the reference
 * tracker. `ROLE` is the group entitled to the payout; `CONTACTS` are the staff
 * who hand it out. Update these here rather than in the template below.
 */
const PAYOUT_ROLE_ID = "1030198924323078194";
const PAYOUT_CONTACT_IDS = [
  "420289176421007360",
  "581255561941614607",
  "894980597557100554",
  "261115988831895552",
  "366506301544726528",
];

/** Reward rate quoted in the payout message, verbatim from the reference. */
const PAYOUT_RATE = "0.5LE per raid";

/**
 * Builds the Discord payout message for the two most recent level-ups,
 * reproducing the reference tracker's wording exactly so the text staff paste
 * does not change.
 *
 * Returns null below two level-ups, where there is no window to pay out.
 *
 * `history` must be newest first.
 */
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

/**
 * Resolves the Level Tracker for one viewer: denies ineligible and anonymous
 * viewers before any data is read, then reports the current level alongside the
 * level-up history the backend has recorded. Returns null on any failure, so the
 * section is simply absent rather than breaking the statistics page.
 *
 * Both halves of the gate are read fresh and fail closed when they come back
 * stale, matching the weekly raid announcement - see `isBranchMemberViewer`.
 */
export async function loadGuildLevelTracker(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<GuildLevelTracker | null> {
  if (!viewer) return null;
  try {
    const [stats, profiles] = await Promise.all([
      getGuildStats(fetchImpl, { allowStale: false }),
      getLinkedRankProfilesResult(fetchImpl, { allowStale: false }),
    ]);
    if (stats.stale || profiles.stale) {
      console.warn("guild level tracker: gate reads are stale, denying");
      return null;
    }
    if (!isBranchMemberViewer(profiles.data, stats.members, viewer)) return null;

    // Fetched only once the gate has passed, so an ineligible viewer costs no
    // upstream call. The backend records changes from its continuously refreshed
    // guild-detail feed, so a level-up no longer waits for a page visit.
    const historyResponse = await getGuildLevelHistory(fetchImpl);
    if (!historyResponse) return null;
    const history = toLevelUps(historyResponse.entries);

    return {
      current: {
        // Still read from the guild stats already loaded above: they are the only
        // source of an XP percentage, and cost nothing extra here. The level can
        // briefly lead the newest history row until the backend receives the
        // same upstream guild payload.
        level: stats.guild.level,
        xpPercent: stats.guild.xp_percent,
        observedAt: stats.generated_at,
      },
      history,
      payoutText: buildPayoutText(history),
    };
  } catch (error) {
    // Without this line an outage of the gate reads or the store looks
    // identical to the viewer simply being ineligible.
    console.warn("guild level tracker unavailable:", error);
    return null;
  }
}
