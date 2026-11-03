import type { SubmitFunction } from "$app/forms";

import type { GuildRankName } from "#lib/api/guildStats.js";
import {
  standingsUnit,
  type CompRole,
  type EligibilityRule,
  type EventIconPlacement,
  type EventTheme,
  type GuildEvent,
  type ManualEntrant,
  type PrizeEntry,
  type RaffleEligibility,
  type RaffleWinner,
  type TrackerKind,
} from "#lib/events/types.js";
import { parseGuildEvent } from "#lib/events/validate.js";
import type { EventFormContext, MemberOption, TrackerOption } from "#lib/server/eventFormContext.js";
import type { RaffleRoll as RaffleRollRecord } from "#lib/server/raffleRolls.js";

export const EDITOR_KEY = Symbol("event-draft");

export type GoalSource = "manual" | "raids" | "raidRuns" | "warPoints" | "wars" | "playtime";
export type MilestoneStyle = "list" | "markers" | "both" | "none";

export interface MilestoneRow {
  id: number;
  at: string | number | null | undefined;
  unlock: string;
  label: string;
}

export interface GoalRow {
  id: number;
  metric: string;
  source: GoalSource;
  raid: string;
  finalTotal: string | number | null | undefined;
  milestones: MilestoneRow[];
  milestoneStyle: MilestoneStyle;
  previewPercent: number;
}

export interface PersonalMilestoneRow {
  id: string;
  key: number;
  at: string | number | null | undefined;
  unlock: string;
}

export type RuleType = "guildRank" | "seqRank" | "stat" | "milestone";
export type StatKind = "raids" | "playtime" | "wars";

export interface RuleRow {
  key: number;
  type: RuleType;
  ranks: string[];
  stat: StatKind;
  statSource: "rollups" | "tracker";
  min: string | number | null | undefined;
  windowFrom: string;
  windowTo: string;
  seedWindowFrom: string;
  seedWindowTo: string;
  milestoneId: string;
}

export interface ManualRow {
  key: number;
  username: string;
  player_uuid: string;
  tickets: string | number | null | undefined;
}

export interface RaffleRow {
  id: string;
  key: number;
  prize: string;
  icon: string;
  wheelStyle: "heads" | "names";
  winnerCount: string | number | null | undefined;
  weightMode: "flat" | "perRaid" | "perStat";
  weightStat: StatKind;
  weightPer: string | number | null | undefined;
  windowFrom: string;
  windowTo: string;
  seedWindowFrom: string;
  seedWindowTo: string;
  whitelistOnly: boolean;
  rules: RuleRow[];
  include: ManualRow[];
  exclude: ManualRow[];
  winners: RaffleWinner[];
  drawnAt: string;
}

interface RaffleSeed {
  id: string;
  prize: string;
  icon?: string;
  wheelStyle?: "heads" | "names";
  winnerCount: string | number | null | undefined;
  perTicket: string | number | null | undefined;
  window?: { from: string; to: string };
  winners?: RaffleWinner[];
  drawnAt?: string;
  requiresMilestone?: string;
  eligibility?: RaffleEligibility;
}

const ICON_PLACEMENT_ORDER: EventIconPlacement[] = ["hero", "band", "meta", "manage"];

export const RAFFLE_MAX_WINNERS = 50;

export function toInput(instant?: string): string {
  return instant ? instant.slice(0, 16) : "";
}

export function toInstant(value: string): string {
  return value.length === 16 ? `${value}:00Z` : `${value}Z`;
}

export function keepInstant(value: string, original: string): string {
  return original && value === toInput(original) ? original : toInstant(value);
}

function canonInstant(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function splitParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function hasCount(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return typeof value === "number" ? Number.isFinite(value) : value.trim() !== "";
}

export function toCount(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  const text = (value ?? "").trim();
  return text === "" ? Number.NaN : Number(text);
}

export interface EventDraftSeed {
  mode: "create" | "edit";
  initial?: GuildEvent | null;
  initialPublished?: boolean;
  initialUpdatedAt?: number | null;
  context?: EventFormContext | null;
}

export class EventDraft {
  readonly mode: "create" | "edit";

  liveInitial = $state<GuildEvent | null>(null);

  knownUpdatedAt = $state<number | null>(null);

  readonly memberChoices: MemberOption[];
  readonly seqRankChoices: string[];
  trackerChoices = $state<TrackerOption[]>([]);
  rollHistory = $state<RaffleRollRecord[]>([]);

  name = $state("");
  slug = $state("");
  slugEdited = $state(false);
  tagline = $state("");
  access = $state<"public" | "members">("members");
  published = $state(false);
  seedStartsAt = $state("");
  seedEndsAt = $state("");
  startsAt = $state("");
  endsAt = $state("");

  skyTop = $state("#171120");
  skyBottom = $state("#251b38");
  accent = $state("#a78bfa");
  accentSecondary = $state("#8fb2f0");
  star = $state("#c4b5fd");

  iconFile = $state("");
  iconPlacements = $state<EventIconPlacement[]>(["hero"]);

  about = $state("");
  private nextRowId = 0;

  goalEnabled = $state(false);
  goals = $state<GoalRow[]>([]);
  personalMilestones = $state<PersonalMilestoneRow[]>([]);

  chartSource = $state<"goal" | "raids" | "raidRuns" | "off">("goal");
  chartRaid = $state("");
  prizes = $state<(Required<PrizeEntry> & { id: number })[]>([]);
  prizesNote = $state("");
  compRoles = $state<(CompRole & { id: number })[]>([]);
  compNote = $state("");
  rules = $state("");
  trackerEnabled = $state(false);
  trackerEventId = $state("");
  trackerTracking = $state<TrackerKind>("api");
  trackerManual = $state(false);

  raffleExcludeWinners = $state(false);
  raffleShowWheel = $state(true);
  raffles = $state<RaffleRow[]>([]);
  rollingId = $state<string | null>(null);
  rollError = $state<string | null>(null);

  showValidation = $state(false);
  saving = $state(false);

  trackerEditor = $state<"closed" | "create" | "edit">("closed");
  trackerEditId = $state("");
  trackerEditStartsAt = $state("");
  trackerEditEndsAt = $state("");
  trackerEditTracking = $state<TrackerKind>("mod");
  trackerBusy = $state(false);
  trackerAttempted = $state(false);
  serverTrackerError = $state<string | null>(null);
  serverSaved = $state(false);
  serverError = $state<string | null>(null);
  serverAuditWarning = $state(false);
  serverRollWarning = $state(false);
  newTrackerName = $state("");
  newTrackerStarts = $state("");
  newTrackerEnds = $state("");
  newTrackerTracking = $state<TrackerKind>("mod");
  newTrackerRaid = $state("");

  presetChoices = $state<{ name: string; payload: string; updatedAt: number }[]>([]);
  selectedPreset = $state("");
  newPresetName = $state("");

  constructor(seed: EventDraftSeed) {
    this.mode = seed.mode;
    const initial = seed.initial ?? null;
    this.liveInitial = initial;
    this.knownUpdatedAt = seed.initialUpdatedAt ?? null;
    this.memberChoices = seed.context?.members ?? [];
    this.seqRankChoices = seed.context?.seqRanks ?? [];
    this.trackerChoices = seed.context?.trackerEvents ?? [];
    this.presetChoices = seed.context?.presets ?? [];

    this.name = initial?.name ?? "";
    this.slug = initial?.slug ?? "";
    this.tagline = initial?.tagline ?? "";
    this.access = initial?.access ?? "members";
    this.published = seed.initialPublished ?? false;
    this.seedStartsAt = initial?.startsAt ?? "";
    this.seedEndsAt = initial?.endsAt ?? "";
    this.startsAt = toInput(initial?.startsAt);
    this.endsAt = toInput(initial?.endsAt);

    this.skyTop = initial?.theme.sky[0] ?? "#171120";
    this.skyBottom = initial?.theme.sky[1] ?? "#251b38";
    this.accent = initial?.theme.accent ?? "#a78bfa";
    this.accentSecondary = initial?.theme.accentSecondary ?? "#8fb2f0";
    this.star = initial?.theme.star ?? "#c4b5fd";

    this.iconFile = initial?.icon?.file ?? "";
    this.iconPlacements = initial?.icon?.placements ?? ["hero"];

    this.about = initial?.about?.join("\n\n") ?? "";

    this.goalEnabled = (initial?.goals?.length ?? 0) > 0;
    this.goals =
      initial?.goals?.map((goal) => ({
        id: this.nextRowId++,
        metric: goal.metricLabel,
        source: goal.feed ?? "manual",
        raid: goal.countRaid ?? "",
        finalTotal: goal.finalTotal ?? "",
        milestones: goal.milestones.map((milestone) => ({
          id: this.nextRowId++,
          at: milestone.at,
          unlock: milestone.unlock,
          label: milestone.label ?? "",
        })),
        milestoneStyle: goal.milestoneStyle ?? "list",
        previewPercent: 60,
      })) ?? [];

    this.personalMilestones =
      initial?.personalMilestones?.map((milestone) => ({
        id: milestone.id,
        key: this.nextRowId++,
        at: milestone.at,
        unlock: milestone.unlock,
      })) ?? [];

    this.chartSource = initial?.activity
      ? initial.activity.source === "none"
        ? "off"
        : initial.activity.source
      : "goal";
    this.chartRaid = initial?.activity?.countRaid ?? "";
    this.prizes =
      initial?.prizes?.map((entry) => ({
        ...entry,
        donorPlayer: entry.donorPlayer ?? "",
        id: this.nextRowId++,
      })) ?? [];
    this.prizesNote = initial?.prizesNote ?? "";
    this.compRoles =
      initial?.comp?.roles.map((role) => ({ ...role, note: role.note ?? "", id: this.nextRowId++ })) ?? [];
    this.compNote = initial?.comp?.note ?? "";
    this.rules = initial?.rules?.join("\n") ?? "";
    this.trackerEnabled = initial?.tracker !== undefined;
    this.trackerEventId = initial?.tracker?.eventId ?? "";
    this.trackerTracking = initial?.tracker?.tracking ?? "api";
    this.trackerManual =
      this.trackerChoices.length === 0 ||
      (initial?.tracker !== undefined &&
        !this.trackerChoices.some((option) => option.id === initial.tracker?.eventId));

    this.raffleExcludeWinners = initial?.raffleExcludeWinners ?? false;
    this.raffleShowWheel = initial?.raffleHideWheel !== true;
    this.raffles = initial?.raffles?.map((raffle) => this.seedRaffleRow(raffle)) ?? [];

    this.lastCaptured = this.payload;
  }

  newMilestoneRow(): MilestoneRow {
    return { id: this.nextRowId++, at: "", unlock: "", label: "" };
  }

  newGoalRow(): GoalRow {
    return {
      id: this.nextRowId++,
      metric: "",
      source: "manual",
      raid: "",
      finalTotal: "",
      milestones: [this.newMilestoneRow()],
      milestoneStyle: "list",
      previewPercent: 60,
    };
  }

  newPersonalMilestoneRow(): PersonalMilestoneRow {
    return { id: crypto.randomUUID(), key: this.nextRowId++, at: "", unlock: "" };
  }

  newRaffleRow(): RaffleRow {
    return {
      id: crypto.randomUUID(),
      key: this.nextRowId++,
      prize: "",
      icon: "",
      wheelStyle: "heads",
      winnerCount: 1,
      weightMode: "perRaid",
      weightStat: "raids",
      weightPer: 5,
      windowFrom: "",
      windowTo: "",
      seedWindowFrom: "",
      seedWindowTo: "",
      whitelistOnly: false,
      rules: [],
      include: [],
      exclude: [],
      winners: [],
      drawnAt: "",
    };
  }

  newRuleRow(type: RuleType): RuleRow {
    return {
      key: this.nextRowId++,
      type,
      ranks: [],
      stat: "raids",
      statSource: "rollups",
      min: "",
      windowFrom: "",
      windowTo: "",
      seedWindowFrom: "",
      seedWindowTo: "",
      milestoneId: "",
    };
  }

  newManualRow(username: string, uuid: string): ManualRow {
    return { key: this.nextRowId++, username, player_uuid: uuid, tickets: "" };
  }

  newRowId(): number {
    return this.nextRowId++;
  }

  private seedRaffleRow(seed: RaffleSeed): RaffleRow {
    const weight = seed.eligibility?.weight;
    const mode = weight?.mode ?? (seed.eligibility ? "flat" : "perRaid");
    const window =
      weight && weight.mode !== "flat" ? weight.window : seed.eligibility ? undefined : seed.window;
    const rules = (seed.eligibility?.rules ?? []).map((rule) => this.seedRuleRow(rule));
    if (!seed.eligibility && seed.requiresMilestone) {
      const rule = this.newRuleRow("milestone");
      rule.milestoneId = seed.requiresMilestone;
      rules.push(rule);
    }
    return {
      id: seed.id,
      key: this.nextRowId++,
      whitelistOnly: seed.eligibility?.whitelistOnly === true,
      prize: seed.prize,
      icon: seed.icon ?? "",
      wheelStyle: seed.wheelStyle === "names" ? "names" : "heads",
      winnerCount: seed.winnerCount,
      weightMode: mode,
      weightStat: weight?.mode === "perStat" ? weight.stat : "raids",
      weightPer: weight
        ? weight.mode === "perRaid"
          ? weight.perTicket
          : weight.mode === "perStat"
            ? weight.per
            : 1
        : seed.eligibility
          ? 1
          : seed.perTicket,
      windowFrom: toInput(window?.from),
      windowTo: toInput(window?.to),
      seedWindowFrom: window?.from ?? "",
      seedWindowTo: window?.to ?? "",
      rules,
      include: (seed.eligibility?.include ?? []).map((entry) => ({
        key: this.nextRowId++,
        username: entry.username,
        player_uuid: entry.player_uuid,
        tickets: entry.tickets ?? "",
      })),
      exclude: (seed.eligibility?.exclude ?? []).map((entry) => ({
        key: this.nextRowId++,
        username: entry.username,
        player_uuid: entry.player_uuid,
        tickets: "",
      })),
      winners: seed.winners ?? [],
      drawnAt: seed.drawnAt ?? "",
    };
  }

  private seedRuleRow(rule: EligibilityRule): RuleRow {
    const row = this.newRuleRow(rule.type);
    switch (rule.type) {
      case "guildRank":
      case "seqRank":
        row.ranks = [...rule.ranks];
        break;
      case "stat":
        row.stat = rule.stat;
        row.statSource = rule.source ?? "rollups";
        row.min = rule.min;
        row.windowFrom = toInput(rule.window.from);
        row.windowTo = toInput(rule.window.to);
        row.seedWindowFrom = rule.window.from;
        row.seedWindowTo = rule.window.to;
        break;
      case "milestone":
        row.milestoneId = rule.milestoneId;
        break;
    }
    return row;
  }

  rowEligibility(row: RaffleRow): RaffleEligibility {
    const eligibility: RaffleEligibility = {};
    if (row.whitelistOnly) eligibility.whitelistOnly = true;
    const include = row.include
      .filter((entry) => entry.player_uuid && entry.username)
      .map((entry) => {
        const manual: ManualEntrant = {
          player_uuid: entry.player_uuid,
          username: entry.username,
        };
        if (hasCount(entry.tickets)) manual.tickets = toCount(entry.tickets);
        return manual;
      });
    if (include.length > 0) eligibility.include = include;
    const exclude = row.exclude
      .filter((entry) => entry.player_uuid && entry.username)
      .map((entry) => ({ player_uuid: entry.player_uuid, username: entry.username }));
    if (exclude.length > 0) eligibility.exclude = exclude;
    const rules = row.rules.map((rule): EligibilityRule => {
      switch (rule.type) {
        case "guildRank":
          return { type: "guildRank", ranks: rule.ranks as GuildRankName[] };
        case "seqRank":
          return { type: "seqRank", ranks: [...rule.ranks] };
        case "stat":
          return {
            type: "stat",
            stat: rule.stat,
            min: toCount(rule.min),
            window: {
              from: canonInstant(keepInstant(rule.windowFrom, rule.seedWindowFrom)),
              to: canonInstant(keepInstant(rule.windowTo, rule.seedWindowTo)),
            },
            ...(rule.statSource === "tracker" ? { source: "tracker" as const } : {}),
          };
        case "milestone":
          return { type: "milestone", milestoneId: rule.milestoneId };
      }
    });
    if (rules.length > 0 && !row.whitelistOnly) eligibility.rules = rules;
    if (row.weightMode === "flat") {
      eligibility.weight = { mode: "flat" };
    } else if (row.weightMode === "perStat") {
      const weight: RaffleEligibility["weight"] = {
        mode: "perStat",
        stat: row.weightStat,
        per: toCount(row.weightPer),
        window: {
          from: canonInstant(keepInstant(row.windowFrom, row.seedWindowFrom)),
          to: canonInstant(keepInstant(row.windowTo, row.seedWindowTo)),
        },
      };
      eligibility.weight = weight;
    } else {
      const weight: RaffleEligibility["weight"] = {
        mode: "perRaid",
        perTicket: toCount(row.weightPer),
      };
      if (row.windowFrom || row.windowTo) {
        weight.window = {
          from: canonInstant(keepInstant(row.windowFrom, row.seedWindowFrom)),
          to: canonInstant(keepInstant(row.windowTo, row.seedWindowTo)),
        };
      }
      eligibility.weight = weight;
    }
    return eligibility;
  }

  readonly seedRaffleIds = $derived(new Set((this.liveInitial?.raffles ?? []).map((raffle) => raffle.id)));

  raffleConfigUnchanged(row: RaffleRow): boolean {
    const initial = this.liveInitial;
    const saved = initial?.raffles?.find((entry) => entry.id === row.id);
    if (!saved) return false;
    const eventConfigUnchanged =
      this.trackerEnabled === (initial?.tracker !== undefined) &&
      this.trackerEventId === (initial?.tracker?.eventId ?? "") &&
      this.trackerTracking === (initial?.tracker?.tracking ?? "api") &&
      this.raffleExcludeWinners === (initial?.raffleExcludeWinners ?? false) &&
      this.raffleShowWheel === (initial?.raffleHideWheel !== true);
    const milestoneTargetsUnchanged = row.rules.every((rule) => {
      if (rule.type !== "milestone" || !rule.milestoneId) return true;
      return (
        toCount(this.personalMilestones.find((entry) => entry.id === rule.milestoneId)?.at) ===
        initial?.personalMilestones?.find((entry) => entry.id === rule.milestoneId)?.at
      );
    });
    const eligibilityUnchanged =
      JSON.stringify(this.rowEligibility(row)) ===
      JSON.stringify(this.rowEligibility(this.seedRaffleRow(saved)));
    const crossExclusionsUnchanged =
      !this.raffleExcludeWinners ||
      (initial?.raffles ?? []).every((entry) => {
        if (entry.id === row.id) return true;
        const draftRow = this.raffles.find((candidate) => candidate.id === entry.id);
        return (entry.winners ?? []).every(
          (winner) => draftRow !== undefined && winner.slot < toCount(draftRow.winnerCount),
        );
      });
    return (
      eventConfigUnchanged &&
      milestoneTargetsUnchanged &&
      eligibilityUnchanged &&
      crossExclusionsUnchanged &&
      row.prize.trim() === saved.prize &&
      toCount(row.winnerCount) === saved.winnerCount
    );
  }

  readonly raffleSlots = $derived.by(() =>
    this.raffles.flatMap((row) => {
      const count = Math.max(
        0,
        Math.min(RAFFLE_MAX_WINNERS, Math.floor(Number(toCount(row.winnerCount)) || 0)),
      );
      const saved = this.seedRaffleIds.has(row.id) && this.raffleConfigUnchanged(row);
      return Array.from({ length: count }, (_unused, slot) => ({
        key: `${row.key}:${slot}`,
        raffleId: row.id,
        slot,
        prize: row.prize.trim(),
        winner: row.winners.find((entry) => entry.slot === slot) ?? null,
        saved,
      }));
    }),
  );

  readonly milestoneOptions = $derived(
    this.personalMilestones
      .filter((row) => hasCount(row.at))
      .map((row) => ({
        id: row.id,
        label: `${row.unlock.trim() || "Milestone"} (≥${toCount(row.at)} raids)`,
      })),
  );

  readonly theme = $derived<EventTheme>({
    sky: [this.skyTop, this.skyBottom],
    accent: this.accent,
    accentSecondary: this.accentSecondary,
    star: this.star,
  });

  readonly draftEvent = $derived.by(() => {
    const event: Record<string, unknown> = {
      slug: this.slug.trim(),
      name: this.name,
      tagline: this.tagline,
      access: this.access,
      theme: this.theme,
    };
    if (this.startsAt) event.startsAt = keepInstant(this.startsAt, this.seedStartsAt);
    if (this.endsAt) event.endsAt = keepInstant(this.endsAt, this.seedEndsAt);
    if (this.iconFile && this.iconPlacements.length > 0) {
      event.icon = {
        file: this.iconFile,
        placements: ICON_PLACEMENT_ORDER.filter((placement) => this.iconPlacements.includes(placement)),
      };
    }
    const paragraphs = splitParagraphs(this.about);
    if (paragraphs.length > 0) event.about = paragraphs;
    if (this.goalEnabled && this.goals.length > 0) {
      event.goals = this.goals.map((row) => {
        const goal: Record<string, unknown> = {
          metricLabel: row.metric,
          milestones: row.milestones
            .filter((milestone) => hasCount(milestone.at) || milestone.unlock.trim())
            .map((milestone) => {
              const entry: Record<string, unknown> = {
                at: toCount(milestone.at),
                unlock: milestone.unlock,
              };
              if (milestone.label.trim()) entry.label = milestone.label.trim();
              return entry;
            }),
        };
        if (row.milestoneStyle !== "list") goal.milestoneStyle = row.milestoneStyle;
        if (row.source !== "manual") {
          goal.feed = row.source;
          if ((row.source === "raids" || row.source === "raidRuns") && row.raid) {
            goal.countRaid = row.raid;
          }
        }
        if (hasCount(row.finalTotal)) goal.finalTotal = toCount(row.finalTotal);
        return goal;
      });
    }
    const filledMilestones = this.personalMilestones
      .filter((row) => hasCount(row.at) || row.unlock.trim())
      .map((row) => ({ id: row.id, at: toCount(row.at), unlock: row.unlock }));
    if (filledMilestones.length > 0) event.personalMilestones = filledMilestones;
    if (this.chartSource === "off") event.activity = { source: "none" };
    else if (this.chartSource !== "goal") {
      event.activity = this.chartRaid
        ? { source: this.chartSource, countRaid: this.chartRaid }
        : { source: this.chartSource };
    }
    const filledPrizes = this.prizes
      .filter((entry) => entry.donor.trim() || entry.prize.trim() || entry.donorPlayer.trim())
      .map(({ donor, prize, donorPlayer }) => ({
        donor: donor.trim() || donorPlayer.trim(),
        prize,
        donorPlayer: donorPlayer.trim() || undefined,
      }));
    if (filledPrizes.length > 0) event.prizes = filledPrizes;
    if (this.prizesNote.trim()) event.prizesNote = this.prizesNote;
    const filledRoles = this.compRoles
      .filter((entry) => entry.role.trim() || entry.builds.trim() || entry.note?.trim())
      .map(({ role, builds, note }) => ({ role, builds, note }));
    if (filledRoles.length > 0) {
      event.comp = this.compNote.trim()
        ? { roles: filledRoles, note: this.compNote }
        : { roles: filledRoles };
    }
    const ruleLines = splitLines(this.rules);
    if (ruleLines.length > 0) event.rules = ruleLines;
    if (this.trackerEnabled) {
      event.tracker = { eventId: this.trackerEventId, tracking: this.trackerTracking };
    }
    const filledRaffles = this.raffles
      .filter(
        (row) =>
          row.prize.trim() ||
          row.windowFrom ||
          row.windowTo ||
          row.rules.length > 0 ||
          row.include.length > 0 ||
          row.exclude.length > 0 ||
          row.winners.length > 0,
      )
      .map((row) => {
        const eligibility = this.rowEligibility(row);
        const raffle: Record<string, unknown> = {
          id: row.id,
          prize: row.prize,
          winnerCount: toCount(row.winnerCount),
          ...(row.icon ? { icon: row.icon } : {}),
          ...(row.wheelStyle === "names" ? { wheelStyle: "names" } : {}),
          perTicket: row.weightMode === "perRaid" ? toCount(row.weightPer) : 1,
        };
        if (row.weightMode === "perRaid" && (row.windowFrom || row.windowTo)) {
          raffle.window = {
            from: keepInstant(row.windowFrom, row.seedWindowFrom),
            to: keepInstant(row.windowTo, row.seedWindowTo),
          };
        }
        const firstMilestoneRule = eligibility.rules?.find((rule) => rule.type === "milestone");
        if (firstMilestoneRule && firstMilestoneRule.type === "milestone") {
          raffle.requiresMilestone = firstMilestoneRule.milestoneId;
        }
        const winnerCount = toCount(row.winnerCount);
        const keptWinners = row.winners.filter(
          (winner) => Number.isInteger(winner.slot) && winner.slot < winnerCount,
        );
        if (keptWinners.length > 0) raffle.winners = keptWinners;
        if (keptWinners.length > 0 && row.drawnAt) raffle.drawnAt = row.drawnAt;
        raffle.eligibility = eligibility;
        return raffle;
      });
    if (filledRaffles.length > 0) event.raffles = filledRaffles;
    if (this.raffleExcludeWinners) event.raffleExcludeWinners = true;
    if (!this.raffleShowWheel) event.raffleHideWheel = true;
    return event;
  });

  readonly parsed = $derived(parseGuildEvent(this.draftEvent));
  readonly liveError = $derived(this.parsed.ok ? null : this.parsed.error);
  readonly payload = $derived(JSON.stringify({ event: this.draftEvent, published: this.published }));
  readonly previewGoals = $derived(this.parsed.ok ? (this.parsed.event.goals ?? []) : []);

  readonly selectedTracker = $derived(
    this.trackerChoices.find((option) => option.id === this.trackerEventId) ?? null,
  );

  readonly trackerKind = $derived<TrackerKind | undefined>(
    this.trackerEnabled ? (this.selectedTracker?.tracking ?? this.trackerTracking) : undefined,
  );

  readonly trackerUnit = $derived(standingsUnit(this.trackerKind));

  readonly trackerDraftError = $derived.by(() => {
    if (!this.newTrackerName.trim()) return "the tracker needs a name";
    if (!this.newTrackerStarts || !this.newTrackerEnds) return "the tracker needs a start and an end";
    const starts = Date.parse(toInstant(this.newTrackerStarts));
    const ends = Date.parse(toInstant(this.newTrackerEnds));
    if (Number.isNaN(starts) || Number.isNaN(ends)) return "tracker times must be valid HH:MM";
    if (starts >= ends) return "the tracker must end after it starts";
    return null;
  });

  readonly trackerPayload = $derived(
    JSON.stringify({
      id: this.trackerEditor === "edit" ? this.trackerEditId : undefined,
      name: this.newTrackerName,
      startsAt: this.newTrackerStarts ? keepInstant(this.newTrackerStarts, this.trackerEditStartsAt) : "",
      endsAt: this.newTrackerEnds ? keepInstant(this.newTrackerEnds, this.trackerEditEndsAt) : "",
      tracking: this.newTrackerTracking,
      raid: this.newTrackerTracking === "mod" ? this.newTrackerRaid : "",
    }),
  );

  readonly presetPayload = $derived(JSON.stringify(this.draftEvent));

  openTrackerCreator() {
    this.newTrackerName = this.newTrackerName || this.name || "";
    this.newTrackerStarts = this.newTrackerStarts || this.startsAt;
    this.newTrackerEnds = this.newTrackerEnds || this.endsAt;
    this.newTrackerTracking = "mod";
    this.trackerEditId = "";
    this.trackerEditStartsAt = "";
    this.trackerEditEndsAt = "";
    this.trackerAttempted = false;
    this.trackerEditor = "create";
  }

  openTrackerEdit() {
    const option = this.selectedTracker;
    if (!option) return;
    this.trackerEditId = option.id;
    this.trackerEditStartsAt = option.startsAt;
    this.trackerEditEndsAt = option.endsAt;
    this.newTrackerName = option.name;
    this.newTrackerStarts = option.startsAt.slice(0, 16);
    this.newTrackerEnds = option.endsAt.slice(0, 16);
    this.newTrackerTracking = option.tracking;
    this.trackerEditTracking = option.tracking;
    this.newTrackerRaid = option.raid ?? "";
    this.trackerAttempted = false;
    this.trackerEditor = "edit";
  }

  syncSlug() {
    if (this.mode === "create" && !this.slugEdited) this.slug = slugify(this.name);
  }

  syncTracking(id: string) {
    const option = this.trackerChoices.find((entry) => entry.id === id);
    if (option) this.trackerTracking = option.tracking;
  }

  leaveManualMode() {
    if (this.trackerChoices.some((entry) => entry.id === this.trackerEventId)) {
      this.syncTracking(this.trackerEventId);
    } else {
      this.trackerEventId = "";
    }
    this.trackerManual = false;
  }

  static readonly HISTORY_LIMIT = 60;
  static readonly CAPTURE_QUIET_MS = 600;
  undoStack = $state<string[]>([]);
  redoStack = $state<string[]>([]);
  lastCaptured = $state("");
  private captureTimer: ReturnType<typeof setTimeout> | undefined;

  scheduleCapture(current: string) {
    clearTimeout(this.captureTimer);
    this.captureTimer = setTimeout(() => this.capture(current), EventDraft.CAPTURE_QUIET_MS);
  }

  cancelCapture() {
    clearTimeout(this.captureTimer);
  }

  capture(current: string) {
    if (current === this.lastCaptured) return;
    this.undoStack.push(this.lastCaptured);
    if (this.undoStack.length > EventDraft.HISTORY_LIMIT) this.undoStack.shift();
    if (this.redoStack.length > 0) this.redoStack.length = 0;
    this.lastCaptured = current;
  }

  readonly hasPendingEdit = $derived(this.payload !== this.lastCaptured);

  undo() {
    this.cancelCapture();
    if (this.hasPendingEdit) {
      this.redoStack.length = 0;
      this.redoStack.push(this.payload);
      this.applySnapshot(this.lastCaptured);
      return;
    }
    const previous = this.undoStack.pop();
    if (previous === undefined) return;
    this.redoStack.push(this.lastCaptured);
    this.applySnapshot(previous);
  }

  redo() {
    this.cancelCapture();
    if (this.hasPendingEdit) {
      this.capture(this.payload);
      return;
    }
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(this.lastCaptured);
    this.applySnapshot(next);
  }

  applySnapshot(snapshot: string) {
    const parsed = JSON.parse(snapshot) as { event?: Record<string, unknown>; published?: boolean };
    this.applyDraft(parsed.event ?? {}, this.mode === "edit");
    this.published = parsed.published === true;
    this.lastCaptured = this.payload;
  }

  applyDraft(draft: Record<string, unknown>, keepSlug: boolean) {
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const count = (value: unknown): string | number =>
      typeof value === "number" && Number.isFinite(value) ? value : "";
    if (!keepSlug) {
      this.slug = text(draft.slug);
      this.slugEdited = this.slug !== "" && this.slug !== slugify(text(draft.name));
    }
    this.name = text(draft.name);
    this.tagline = text(draft.tagline);
    this.access = draft.access === "public" ? "public" : "members";
    const themeDraft = (draft.theme ?? {}) as Record<string, unknown>;
    const sky = Array.isArray(themeDraft.sky) ? themeDraft.sky : [];
    this.skyTop = text(sky[0]) || "#171120";
    this.skyBottom = text(sky[1]) || "#251b38";
    this.accent = text(themeDraft.accent) || "#a78bfa";
    this.accentSecondary = text(themeDraft.accentSecondary) || "#8fb2f0";
    this.star = text(themeDraft.star) || "#c4b5fd";
    const iconDraft = (draft.icon ?? null) as Record<string, unknown> | null;
    this.iconFile = iconDraft ? text(iconDraft.file) : "";
    const placementsDraft =
      iconDraft && Array.isArray(iconDraft.placements) ? iconDraft.placements : null;
    this.iconPlacements = placementsDraft
      ? ICON_PLACEMENT_ORDER.filter((placement) => placementsDraft.includes(placement))
      : ["hero"];
    this.seedStartsAt = text(draft.startsAt);
    this.seedEndsAt = text(draft.endsAt);
    this.startsAt = this.seedStartsAt.slice(0, 16);
    this.endsAt = this.seedEndsAt.slice(0, 16);
    this.about = Array.isArray(draft.about)
      ? draft.about.filter((entry): entry is string => typeof entry === "string").join("\n\n")
      : "";
    const goalsDraft = Array.isArray(draft.goals) ? draft.goals : [];
    this.goalEnabled = goalsDraft.length > 0;
    this.goals = goalsDraft.map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const milestonesDraft =
        Array.isArray(record.milestones) && record.milestones.length > 0 ? record.milestones : [{}];
      return {
        id: this.nextRowId++,
        metric: text(record.metricLabel),
        source: (record.feed === "raids" ||
        record.feed === "raidRuns" ||
        record.feed === "warPoints" ||
        record.feed === "wars" ||
        record.feed === "playtime"
          ? record.feed
          : "manual") as GoalSource,
        raid: text(record.countRaid),
        finalTotal: count(record.finalTotal),
        milestones: milestonesDraft.map((milestone) => {
          const milestoneRecord = (milestone ?? {}) as Record<string, unknown>;
          return {
            id: this.nextRowId++,
            at: count(milestoneRecord.at),
            unlock: text(milestoneRecord.unlock),
            label: text(milestoneRecord.label),
          };
        }),
        milestoneStyle: (record.milestoneStyle === "markers" ||
        record.milestoneStyle === "both" ||
        record.milestoneStyle === "none"
          ? record.milestoneStyle
          : "list") as MilestoneStyle,
        previewPercent: 60,
      };
    });
    const milestonesDraft = Array.isArray(draft.personalMilestones) ? draft.personalMilestones : [];
    this.personalMilestones = milestonesDraft.map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      return {
        id: text(record.id) || crypto.randomUUID(),
        key: this.nextRowId++,
        at: count(record.at),
        unlock: text(record.unlock),
      };
    });
    const activityDraft = (draft.activity ?? null) as Record<string, unknown> | null;
    this.chartSource = activityDraft
      ? activityDraft.source === "none"
        ? "off"
        : activityDraft.source === "raids" || activityDraft.source === "raidRuns"
          ? activityDraft.source
          : "goal"
      : "goal";
    this.chartRaid = activityDraft ? text(activityDraft.countRaid) : "";
    this.prizes = (Array.isArray(draft.prizes) ? draft.prizes : []).map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      return {
        donor: text(record.donor),
        prize: text(record.prize),
        donorPlayer: text(record.donorPlayer),
        id: this.nextRowId++,
      };
    });
    this.prizesNote = text(draft.prizesNote);
    const compDraft = (draft.comp ?? null) as Record<string, unknown> | null;
    this.compRoles = (compDraft && Array.isArray(compDraft.roles) ? compDraft.roles : []).map(
      (entry) => {
        const record = (entry ?? {}) as Record<string, unknown>;
        return {
          role: text(record.role),
          builds: text(record.builds),
          note: text(record.note),
          id: this.nextRowId++,
        };
      },
    );
    this.compNote = compDraft ? text(compDraft.note) : "";
    this.rules = Array.isArray(draft.rules)
      ? draft.rules.filter((entry): entry is string => typeof entry === "string").join("\n")
      : "";
    const trackerDraft = (draft.tracker ?? null) as Record<string, unknown> | null;
    this.trackerEnabled = trackerDraft !== null;
    this.trackerEventId = trackerDraft ? text(trackerDraft.eventId) : "";
    this.trackerTracking =
      trackerDraft && (trackerDraft.tracking === "mod" || trackerDraft.tracking === "wars")
        ? trackerDraft.tracking
        : "api";
    this.trackerManual =
      this.trackerChoices.length === 0 ||
      (this.trackerEnabled && !this.trackerChoices.some((option) => option.id === this.trackerEventId));
    const rafflesDraft = Array.isArray(draft.raffles) ? draft.raffles : [];
    this.raffles = rafflesDraft.map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const windowRecord = (record.window ?? null) as Record<string, unknown> | null;
      const winnersDraft = Array.isArray(record.winners) ? record.winners : [];
      return this.seedRaffleRow({
        id: text(record.id) || crypto.randomUUID(),
        prize: text(record.prize),
        icon: text(record.icon),
        winnerCount: count(record.winnerCount),
        perTicket: count(record.perTicket),
        window: windowRecord
          ? { from: text(windowRecord.from), to: text(windowRecord.to) }
          : undefined,
        winners: winnersDraft.map((winner) => {
          const winnerRecord = (winner ?? {}) as Record<string, unknown>;
          const frozen: RaffleWinner = {
            slot: typeof winnerRecord.slot === "number" ? winnerRecord.slot : 0,
            username: text(winnerRecord.username),
            player_uuid: text(winnerRecord.player_uuid),
            tickets: typeof winnerRecord.tickets === "number" ? winnerRecord.tickets : 0,
          };
          if (winnerRecord.source === "manual") frozen.source = "manual";
          return frozen;
        }),
        drawnAt: text(record.drawnAt) || undefined,
        requiresMilestone: text(record.requiresMilestone) || undefined,
        eligibility:
          record.eligibility && typeof record.eligibility === "object"
            ? (record.eligibility as RaffleEligibility)
            : undefined,
      });
    });
    this.raffleExcludeWinners = draft.raffleExcludeWinners === true;
    this.raffleShowWheel = draft.raffleHideWheel !== true;
  }

  loadPreset() {
    const preset = this.presetChoices.find((entry) => entry.name === this.selectedPreset);
    if (!preset) return;
    let draft: Record<string, unknown>;
    try {
      draft = JSON.parse(preset.payload) as Record<string, unknown>;
    } catch {
      return;
    }
    this.cancelCapture();
    this.capture(this.payload);
    this.undoStack.push(this.lastCaptured);
    if (this.undoStack.length > EventDraft.HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.applySnapshot(JSON.stringify({ event: draft, published: this.published }));
  }

  readonly presetSubmit: SubmitFunction = () => {
    const payloadAtSubmit = this.presetPayload;
    return async ({ result, update }) => {
      if (result.type === "success") {
        const saved = (result.data as { presetSaved?: unknown } | undefined)?.presetSaved;
        if (typeof saved === "string") {
          const entry = { name: saved, payload: payloadAtSubmit, updatedAt: Date.now() };
          const index = this.presetChoices.findIndex((candidate) => candidate.name === saved);
          if (index >= 0) this.presetChoices[index] = entry;
          else {
            this.presetChoices.push(entry);
            this.presetChoices.sort((a, b) => a.name.localeCompare(b.name));
          }
          this.selectedPreset = saved;
          this.newPresetName = "";
        }
      }
      await update();
    };
  };

  readonly presetDelete: SubmitFunction = () => {
    return async ({ result, update }) => {
      if (result.type === "success") {
        const deleted = (result.data as { presetDeleted?: unknown } | undefined)?.presetDeleted;
        if (typeof deleted === "string") {
          this.presetChoices = this.presetChoices.filter((candidate) => candidate.name !== deleted);
          if (this.selectedPreset === deleted) this.selectedPreset = "";
        }
      }
      await update();
    };
  };

  readonly submit: SubmitFunction = ({ action, cancel, formData }) => {
    if (action.search.includes("createTracker") || action.search.includes("updateTracker")) {
      this.trackerAttempted = true;
      if (this.trackerDraftError) {
        cancel();
        return;
      }
      this.trackerBusy = true;
      return async ({ update }) => {
        this.trackerBusy = false;
        await update({ reset: false });
      };
    }
    if (action.search.includes("rollRaffle")) {
      this.rollError = null;
      // Mark the roll in flight here, not in the button's onclick: disabling a
      // submit button from within its own click handler makes Svelte flush the
      // `disabled` update before the browser dispatches the submit, cancelling
      // it. By the time enhance calls submit, the submission is already ours to
      // keep, so disabling the buttons now is safe.
      this.rollingId = String(formData.get("rollTarget") ?? "pending");
      return async ({ result, update }) => {
        if (result.type === "success") {
          const data = result.data as
            | {
                rolled?: string;
                slot?: number;
                winner?: RaffleWinner;
                drawnAt?: string;
                newUpdatedAt?: number;
              }
            | undefined;
          const row = this.raffles.find((entry) => entry.id === data?.rolled);
          if (row && data?.winner && typeof data.slot === "number") {
            row.winners = [
              ...row.winners.filter((entry) => entry.slot !== data.slot),
              data.winner,
            ];
            row.drawnAt = data.drawnAt ?? new Date().toISOString();
          }
          this.knownUpdatedAt = data?.newUpdatedAt ?? this.knownUpdatedAt;
        } else if (result.type === "failure") {
          this.rollError =
            (result.data as { error?: string } | undefined)?.error ?? "The roll failed.";
        }
        this.rollingId = null;
        await update({ reset: false });
      };
    }
    this.showValidation = true;
    if (this.liveError) {
      cancel();
      return;
    }
    this.saving = true;
    return async ({ result, update }) => {
      this.saving = false;
      if (result.type === "success") {
        const data = result.data as { newUpdatedAt?: number } | undefined;
        this.knownUpdatedAt = data?.newUpdatedAt ?? this.knownUpdatedAt;
      }
      await update({ reset: false });
    };
  };
}
