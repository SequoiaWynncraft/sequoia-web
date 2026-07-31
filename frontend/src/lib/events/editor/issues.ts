import { hasCount, toCount, toInstant, type EventDraft } from "./draft.svelte";

/** Editor sections in page order; ids double as the anchor fragments. */
export const EDITOR_SECTIONS = [
  { id: "identity", label: "Identity" },
  { id: "schedule", label: "Schedule" },
  { id: "sky", label: "Sky" },
  { id: "icon", label: "Icon" },
  { id: "about", label: "About" },
  { id: "goals", label: "Goals" },
  { id: "milestones", label: "Personal milestones" },
  { id: "activity", label: "Activity chart" },
  { id: "prizes", label: "Prizes" },
  { id: "comp", label: "Suggested comp" },
  { id: "rules", label: "Rules" },
  { id: "standings", label: "Standings" },
  { id: "raffles", label: "Raffles" },
] as const;

export type SectionId = (typeof EDITOR_SECTIONS)[number]["id"];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function invalidInstant(value: string): boolean {
  return value !== "" && Number.isNaN(Date.parse(toInstant(value)));
}

/**
 * Per-section problems for the rail badges. Deliberately lighter than the
 * server validator (which stays the authority and reports first-error-only):
 * these are the mistakes a manager can see and fix in place, keyed to where
 * they live on the page.
 */
export function sectionIssues(draft: EventDraft): Partial<Record<SectionId, string[]>> {
  const issues: Partial<Record<SectionId, string[]>> = {};
  const add = (section: SectionId, message: string) => {
    (issues[section] ??= []).push(message);
  };

  if (!draft.name.trim()) add("identity", "Name is required");
  if (!draft.slug.trim()) add("identity", "Slug is required");
  if (!draft.tagline.trim()) add("identity", "Tagline is required");

  if ((draft.startsAt === "") !== (draft.endsAt === "")) {
    add("schedule", "Set both dates, or neither for TBA");
  }
  if (invalidInstant(draft.startsAt) || invalidInstant(draft.endsAt)) {
    add("schedule", "Times must be valid HH:MM");
  } else if (
    draft.startsAt &&
    draft.endsAt &&
    Date.parse(toInstant(draft.startsAt)) >= Date.parse(toInstant(draft.endsAt))
  ) {
    add("schedule", "The event must end after it starts");
  }

  for (const color of [draft.skyTop, draft.skyBottom, draft.accent, draft.accentSecondary, draft.star]) {
    if (!HEX_COLOR.test(color)) {
      add("sky", "Colors must be #rrggbb");
      break;
    }
  }

  if (draft.goalEnabled) {
    for (const [index, goal] of draft.goals.entries()) {
      const label = draft.goals.length === 1 ? "The goal" : `Goal ${index + 1}`;
      if (!goal.metric.trim()) add("goals", `${label} needs a metric`);
      const targets = goal.milestones.filter((row) => hasCount(row.at)).map((row) => toCount(row.at));
      if (targets.length === 0) add("goals", `${label} needs a milestone target`);
      else if (targets.some((at, i) => i > 0 && at <= targets[i - 1])) {
        add("goals", `${label}'s targets must ascend`);
      }
    }
  }

  const personalTargets = draft.personalMilestones
    .filter((row) => hasCount(row.at))
    .map((row) => toCount(row.at));
  if (personalTargets.some((at, i) => i > 0 && at <= personalTargets[i - 1])) {
    add("milestones", "Targets must ascend");
  }

  for (const prize of draft.prizes) {
    const filled = prize.donor.trim() || prize.donorPlayer.trim() || prize.prize.trim();
    if (filled && !prize.prize.trim()) {
      add("prizes", "A prize row needs its prize");
      break;
    }
  }

  if (draft.trackerEnabled && !draft.trackerEventId.trim()) {
    add("standings", "Pick or enter a tracker event");
  }

  for (const raffle of draft.raffles) {
    const filled =
      raffle.prize.trim() ||
      raffle.windowFrom ||
      raffle.windowTo ||
      raffle.rules.length > 0 ||
      raffle.include.length > 0 ||
      raffle.exclude.length > 0 ||
      raffle.winners.length > 0;
    if (!filled) continue;
    if (!raffle.prize.trim()) add("raffles", "A raffle needs a prize");
    if (raffle.whitelistOnly && raffle.include.length === 0) {
      add("raffles", "A whitelist raffle needs members on its include list");
    }
    const winnerCount = toCount(raffle.winnerCount);
    if (!Number.isInteger(winnerCount) || winnerCount < 1) add("raffles", "Winners must be at least 1");
    if (raffle.weightMode !== "flat") {
      const per = toCount(raffle.weightPer);
      if (!Number.isInteger(per) || per < 1) {
        add("raffles", raffle.weightMode === "perRaid" ? "Raids per ticket must be at least 1" : "Per-stat divisor must be at least 1");
      }
    }
    const windowRequired = raffle.weightMode === "perStat";
    if (windowRequired && (!raffle.windowFrom || !raffle.windowTo)) {
      add("raffles", "A per-stat weight needs a counting window");
    } else if (
      windowRequired &&
      (!raffle.windowFrom.endsWith("T00:00") || !raffle.windowTo.endsWith("T00:00"))
    ) {
      add("raffles", "Per-stat windows count whole UTC days - use 00:00 bounds");
    } else if ((raffle.windowFrom === "") !== (raffle.windowTo === "")) {
      add("raffles", "A window needs both bounds");
    } else if (invalidInstant(raffle.windowFrom) || invalidInstant(raffle.windowTo)) {
      add("raffles", "Window times must be valid HH:MM");
    } else if (
      raffle.windowFrom &&
      raffle.windowTo &&
      Date.parse(toInstant(raffle.windowFrom)) >= Date.parse(toInstant(raffle.windowTo))
    ) {
      add("raffles", "The window must end after it starts");
    }
    for (const rule of raffle.rules) {
      if ((rule.type === "guildRank" || rule.type === "seqRank") && rule.ranks.length === 0) {
        add("raffles", "A rank rule needs at least one rank");
      }
      if (rule.type === "stat") {
        if (!hasCount(rule.min)) add("raffles", "A stat rule needs a minimum");
        if (!rule.windowFrom || !rule.windowTo) add("raffles", "A stat rule needs a window");
        else if (!rule.windowFrom.endsWith("T00:00") || !rule.windowTo.endsWith("T00:00")) {
          add("raffles", "Stat windows count whole UTC days - use 00:00 bounds");
        }
      }
      if (rule.type === "milestone" && !rule.milestoneId) {
        add("raffles", "A milestone rule needs a milestone");
      }
    }
    for (const entry of [...raffle.include, ...raffle.exclude]) {
      if (!entry.player_uuid) {
        add("raffles", "Pick members from the roster list");
        break;
      }
    }
  }

  return issues;
}
