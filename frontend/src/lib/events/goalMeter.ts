import type { GoalMilestone } from "./types";

/**
 * Long ladders (personal milestones run up to 64) cannot render every tier: the
 * ticks collapse into a smear on a 6px track and the list buries the one tier
 * the member actually cares about. At or past this many, GoalMeter shows a
 * window around the member's position and counts the rest instead.
 */
export const COMPACT_FROM = 16;

/**
 * Rows kept when compact: the tier the member holds, the one they are working
 * toward, and one beyond it. Constant regardless of where they sit on the
 * ladder, so the meter does not change height as they progress.
 */
const VISIBLE_TIERS = 3;

export interface MilestoneWindow {
  /** True once the ladder is long enough to summarize rather than list. */
  compact: boolean;
  /** The tiers to render; the whole ladder when not compact. */
  visible: GoalMilestone[];
  /** Cleared tiers below the window, summarized in one line. */
  hiddenBefore: number;
  /** Locked tiers above the window, ending at the headline target. */
  hiddenAfter: number;
}

/**
 * Picks the slice of a milestone ladder worth showing: the highest tier already
 * reached (what the member holds) plus the next few locked ones (what they are
 * working toward).
 *
 * Ladders shorter than `COMPACT_FROM` are returned whole, so existing goals
 * render exactly as they did before compacting existed. `reached` is passed in
 * rather than a raw count so the caller's "unknown progress" case (a null
 * count, which reaches nothing) needs no special handling here.
 */
export function milestoneWindow(
  milestones: GoalMilestone[],
  reached: (at: number) => boolean,
): MilestoneWindow {
  if (milestones.length < COMPACT_FROM) {
    return { compact: false, visible: milestones, hiddenBefore: 0, hiddenAfter: 0 };
  }
  const nextIndex = milestones.findIndex((milestone) => !reached(milestone.at));
  // Every tier cleared: anchor past the end so the window clamps to the top of
  // the ladder rather than running off it.
  const anchor = nextIndex === -1 ? milestones.length : nextIndex;
  // One cleared tier of context above the next one, clamped to both ends so the
  // window keeps its size at the very start and the very top.
  const start = Math.min(Math.max(anchor - 1, 0), milestones.length - VISIBLE_TIERS);
  const end = start + VISIBLE_TIERS;
  return {
    compact: true,
    visible: milestones.slice(start, end),
    hiddenBefore: start,
    hiddenAfter: Math.max(0, milestones.length - end),
  };
}
