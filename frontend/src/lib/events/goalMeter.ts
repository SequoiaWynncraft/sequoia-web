import type { GoalMilestone } from "./types";

export const COMPACT_FROM = 16;

const VISIBLE_TIERS = 3;

export interface MilestoneWindow {
  compact: boolean;
  visible: GoalMilestone[];
  hiddenBefore: number;
  hiddenAfter: number;
}

export function milestoneWindow(
  milestones: GoalMilestone[],
  reached: (at: number) => boolean,
): MilestoneWindow {
  if (milestones.length < COMPACT_FROM) {
    return { compact: false, visible: milestones, hiddenBefore: 0, hiddenAfter: 0 };
  }
  const nextIndex = milestones.findIndex((milestone) => !reached(milestone.at));
  const anchor = nextIndex === -1 ? milestones.length : nextIndex;
  const start = Math.min(Math.max(anchor - 1, 0), milestones.length - VISIBLE_TIERS);
  const end = start + VISIBLE_TIERS;
  return {
    compact: true,
    visible: milestones.slice(start, end),
    hiddenBefore: start,
    hiddenAfter: Math.max(0, milestones.length - end),
  };
}
