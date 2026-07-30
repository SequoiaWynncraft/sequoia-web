import type { SubmitFunction } from "@sveltejs/kit";

import type { GuildRankName } from "$lib/api/guildStats";
import type {
  CompRole,
  EligibilityRule,
  EventIconPlacement,
  EventTheme,
  GuildEvent,
  ManualEntrant,
  PrizeEntry,
  RaffleEligibility,
  RaffleWinner,
} from "$lib/events/types";
import { parseGuildEvent } from "$lib/events/validate";
import type { EventFormContext, MemberOption, TrackerOption } from "$lib/server/eventFormContext";

/** Context key the editor shell shares its EventDraft under. */
export const EDITOR_KEY = Symbol("event-draft");

export type GoalSource = "manual" | "raids" | "raidRuns" | "wars" | "playtime";
export type MilestoneStyle = "list" | "markers" | "both" | "none";

export interface MilestoneRow {
  id: number;
  // Number inputs bind numbers (or null when cleared), not strings.
  at: string | number | null | undefined;
  unlock: string;
  /** Short marker text under the meter; empty falls back to the target. */
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
  /** Preview slider position as a percentage of the last milestone. */
  previewPercent: number;
}

export interface PersonalMilestoneRow {
  /** Stable id persisted in the event JSON and targeted by raffle gates. */
  id: string;
  /** Local list key, distinct from the persisted id. */
  key: number;
  at: string | number | null | undefined;
  unlock: string;
}

export type RuleType = "guildRank" | "seqRank" | "stat" | "milestone";
export type StatKind = "raids" | "playtime" | "wars";

/** One eligibility rule under construction; incomplete rows drop at serialize. */
export interface RuleRow {
  /** Local list key. */
  key: number;
  type: RuleType;
  /** Selected rank names, for guildRank/seqRank rules. */
  ranks: string[];
  stat: StatKind;
  min: string | number | null | undefined;
  windowFrom: string;
  windowTo: string;
  /** Original window instants, so an untouched field keeps its seconds. */
  seedWindowFrom: string;
  seedWindowTo: string;
  milestoneId: string;
}

/** A hand-picked include/exclude entry; tickets only matter on includes. */
export interface ManualRow {
  /** Local list key. */
  key: number;
  username: string;
  player_uuid: string;
  tickets: string | number | null | undefined;
}

export interface RaffleRow {
  /** Stable id that persists in the event JSON and targets rolls. */
  id: string;
  /** Local list key, distinct from the persisted id. */
  key: number;
  prize: string;
  winnerCount: string | number | null | undefined;
  /** Ticket weighting; windowFrom/To below is the weight's counting window. */
  weightMode: "flat" | "perRaid" | "perStat";
  weightStat: StatKind;
  /** perTicket (perRaid) or per (perStat). */
  weightPer: string | number | null | undefined;
  windowFrom: string;
  windowTo: string;
  /** Original window instants, so an untouched field keeps its seconds. */
  seedWindowFrom: string;
  seedWindowTo: string;
  rules: RuleRow[];
  include: ManualRow[];
  exclude: ManualRow[];
  /** Frozen roll results, edited only by rolling - passed through on save. */
  winners: RaffleWinner[];
  drawnAt: string;
}

/** The lenient raffle shape both seeding paths (typed event, snapshot) share. */
interface RaffleSeed {
  id: string;
  prize: string;
  winnerCount: string | number | null | undefined;
  perTicket: string | number | null | undefined;
  window?: { from: string; to: string };
  winners?: RaffleWinner[];
  drawnAt?: string;
  requiresMilestone?: string;
  eligibility?: RaffleEligibility;
}

// Placements serialize in this fixed order, so click order never churns
// the payload (and with it the undo history).
export const ICON_PLACEMENT_ORDER: EventIconPlacement[] = ["hero", "band", "meta", "manage"];

export const RAFFLE_MAX_WINNERS = 50;

// ── Pure helpers ──────────────────────────────────────────────────────

export function toInput(instant?: string): string {
  return instant ? instant.slice(0, 16) : "";
}

/** datetime-local values are read as UTC wall time. */
export function toInstant(value: string): string {
  return value.length === 16 ? `${value}:00Z` : `${value}Z`;
}

/** An untouched input keeps its original instant, seconds and all. */
export function keepInstant(value: string, original: string): string {
  return original && value === toInput(original) ? original : toInstant(value);
}

export function slugify(value: string): string {
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

// Cleared or invalid number inputs bind null or undefined depending on the
// browser path - treat both as empty.
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

/**
 * The whole editor state: every field, the serialized draft, the undo/redo
 * history, and the enhanced-submit handlers. One instance is created by
 * EventEditor and shared with the section components via context, so the
 * form stays a single unit (one payload, one history, one version token)
 * while its markup lives in per-section files.
 *
 * Effects cannot live here (class fields run outside component init), so
 * EventEditor owns them: history capture debouncing, tracker adoption,
 * milestone-gate clearing, and the live `initial` sync into `liveInitial`.
 */
export class EventDraft {
  readonly mode: "create" | "edit";

  // The live `initial` prop, synced by EventEditor: a save that adds a
  // raffle unlocks its roll button without a full reload; undo never
  // touches it, so replayed snapshots stay out of the picture.
  liveInitial = $state<GuildEvent | null>(null);

  /**
   * The version token the visible draft is based on. Every enhanced action
   * reruns `load`, so adopting the live prop would take over a concurrent
   * manager's version after e.g. a tracker or preset action - letting this
   * editor save or delete over content it never displayed. Seeded at mount,
   * advanced only by this tab's own successful saves and rolls.
   */
  knownUpdatedAt = $state<number | null>(null);

  readonly memberChoices: MemberOption[];
  /** Org ladder labels for the eligibility picker, most senior first. */
  readonly seqRankChoices: string[];
  trackerChoices = $state<TrackerOption[]>([]);

  name = $state("");
  slug = $state("");
  slugEdited = $state(false);
  tagline = $state("");
  access = $state<"public" | "members">("members");
  published = $state(false);
  // Original instants survive untouched edits - datetime-local inputs carry
  // minute precision, and rewriting an unchanged value would shift seconds.
  // Reassigned by applyDraft so replayed snapshots keep THEIR exact seconds,
  // not the originally loaded event's.
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
  // Repeater rows carry a locally generated id so the each blocks are keyed -
  // unkeyed lists with two-way bindings corrupt state when middle rows are
  // removed.
  private nextRowId = 0;

  goalEnabled = $state(false);
  goals = $state<GoalRow[]>([]);
  personalMilestones = $state<PersonalMilestoneRow[]>([]);

  // Chart source: "goal" follows the first raid-based goal, "raids"/"raidRuns"
  // chart raids explicitly, "off" hides the chart; chartRaid narrows to one raid.
  chartSource = $state<"goal" | "raids" | "raidRuns" | "off">("goal");
  chartRaid = $state("");
  prizes = $state<(Required<PrizeEntry> & { id: number })[]>([]);
  prizesNote = $state("");
  compRoles = $state<(CompRole & { id: number })[]>([]);
  compNote = $state("");
  rules = $state("");
  trackerEnabled = $state(false);
  trackerEventId = $state("");
  trackerTracking = $state<"api" | "mod">("api");
  // Manual id entry is the fallback when the backend list is unavailable or
  // the stored id is not in it.
  trackerManual = $state(false);

  raffleExcludeWinners = $state(false);
  raffles = $state<RaffleRow[]>([]);
  rollingId = $state<string | null>(null);
  rollError = $state<string | null>(null);

  showValidation = $state(false);
  saving = $state(false);
  confirmingDelete = $state(false);

  // Inline tracker editor inside the standings section - creates new
  // tracker events or edits the selected one.
  trackerEditor = $state<"closed" | "create" | "edit">("closed");
  trackerEditId = $state("");
  trackerEditStartsAt = $state("");
  trackerEditEndsAt = $state("");
  trackerBusy = $state(false);
  trackerAttempted = $state(false);
  /** The last ?/createTracker or ?/updateTracker rejection, synced from props. */
  serverTrackerError = $state<string | null>(null);
  // The last save's outcome, synced from props so the rail can show it next
  // to its sticky save button - the footer alone scrolls out of view.
  serverSaved = $state(false);
  serverError = $state<string | null>(null);
  serverAuditWarning = $state(false);
  newTrackerName = $state("");
  newTrackerStarts = $state("");
  newTrackerEnds = $state("");
  newTrackerTracking = $state<"api" | "mod">("mod");
  newTrackerRaid = $state("");

  // ── Presets ─────────────────────────────────────────────────────────
  presetChoices = $state<{ name: string; payload: string; updatedAt: number }[]>([]);
  selectedPreset = $state("");
  newPresetName = $state("");
  confirmingPresetDelete = $state(false);

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
    this.raffles = initial?.raffles?.map((raffle) => this.seedRaffleRow(raffle)) ?? [];

    this.lastCaptured = this.payload;
  }

  // ── Row factories ───────────────────────────────────────────────────

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
      winnerCount: 1,
      weightMode: "perRaid",
      weightStat: "raids",
      weightPer: 5,
      windowFrom: "",
      windowTo: "",
      seedWindowFrom: "",
      seedWindowTo: "",
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

  /** Builds a builder row from a stored raffle - or, absent an eligibility
   * block, from the legacy fields, so opening any raffle lands in the same
   * builder (the first save then writes the eligibility it shows). */
  private seedRaffleRow(seed: RaffleSeed): RaffleRow {
    const weight = seed.eligibility?.weight;
    const window = weight
      ? weight.mode === "flat"
        ? undefined
        : weight.window
      : seed.window;
    const rules = (seed.eligibility?.rules ?? []).map((rule) => this.seedRuleRow(rule));
    // The legacy milestone gate reads as a milestone rule in the builder.
    if (!seed.eligibility && seed.requiresMilestone) {
      const rule = this.newRuleRow("milestone");
      rule.milestoneId = seed.requiresMilestone;
      rules.push(rule);
    }
    return {
      id: seed.id,
      key: this.nextRowId++,
      prize: seed.prize,
      winnerCount: seed.winnerCount,
      weightMode: weight?.mode ?? "perRaid",
      weightStat: weight?.mode === "perStat" ? weight.stat : "raids",
      weightPer: weight
        ? weight.mode === "perRaid"
          ? weight.perTicket
          : weight.mode === "perStat"
            ? weight.per
            : 1
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
        tickets: entry.tickets ?? 1,
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

  /**
   * The eligibility block a row serializes to. Incomplete rule rows and
   * unresolved manual picks drop, like every other empty repeater row; a
   * milestone rule only survives while its milestone does.
   */
  rowEligibility(row: RaffleRow, milestoneIds: Set<string>): RaffleEligibility {
    const eligibility: RaffleEligibility = {};
    const include = row.include
      .filter((entry) => entry.player_uuid && entry.username)
      .map((entry) => {
        const manual: ManualEntrant = {
          player_uuid: entry.player_uuid,
          username: entry.username,
        };
        const tickets = toCount(entry.tickets);
        if (Number.isFinite(tickets) && tickets > 1) manual.tickets = tickets;
        return manual;
      });
    if (include.length > 0) eligibility.include = include;
    const exclude = row.exclude
      .filter((entry) => entry.player_uuid && entry.username)
      .map((entry) => ({ player_uuid: entry.player_uuid, username: entry.username }));
    if (exclude.length > 0) eligibility.exclude = exclude;
    const rules = row.rules.flatMap((rule): EligibilityRule[] => {
      switch (rule.type) {
        case "guildRank":
          return rule.ranks.length > 0
            ? [{ type: "guildRank", ranks: rule.ranks as GuildRankName[] }]
            : [];
        case "seqRank":
          return rule.ranks.length > 0 ? [{ type: "seqRank", ranks: [...rule.ranks] }] : [];
        case "stat":
          if (!hasCount(rule.min) || !rule.windowFrom || !rule.windowTo) return [];
          return [
            {
              type: "stat",
              stat: rule.stat,
              min: toCount(rule.min),
              window: {
                from: keepInstant(rule.windowFrom, rule.seedWindowFrom),
                to: keepInstant(rule.windowTo, rule.seedWindowTo),
              },
            },
          ];
        case "milestone":
          return rule.milestoneId && milestoneIds.has(rule.milestoneId)
            ? [{ type: "milestone", milestoneId: rule.milestoneId }]
            : [];
      }
    });
    if (rules.length > 0) eligibility.rules = rules;
    if (row.weightMode === "flat") {
      eligibility.weight = { mode: "flat" };
    } else if (row.weightMode === "perStat") {
      const weight: RaffleEligibility["weight"] = {
        mode: "perStat",
        stat: row.weightStat,
        per: toCount(row.weightPer),
        window: {
          from: keepInstant(row.windowFrom, row.seedWindowFrom),
          to: keepInstant(row.windowTo, row.seedWindowTo),
        },
      };
      eligibility.weight = weight;
    } else {
      const weight: RaffleEligibility["weight"] = {
        mode: "perRaid",
        perTicket: toCount(row.weightPer),
      };
      // Either bound present serializes, so a one-sided window reaches the
      // validator instead of silently vanishing.
      if (row.windowFrom || row.windowTo) {
        weight.window = {
          from: keepInstant(row.windowFrom, row.seedWindowFrom),
          to: keepInstant(row.windowTo, row.seedWindowTo),
        };
      }
      eligibility.weight = weight;
    }
    return eligibility;
  }

  // ── Derived views ───────────────────────────────────────────────────

  // Only raffles that already exist server-side can be rolled - a fresh row
  // must be saved first.
  readonly seedRaffleIds = $derived(new Set((this.liveInitial?.raffles ?? []).map((raffle) => raffle.id)));

  // A saved raffle is only rollable while its draw-affecting config matches what
  // the server holds: the roll runs against the stored winnerCount/perTicket/
  // window, so unsaved edits to those would silently draw against stale values.
  raffleConfigUnchanged(row: RaffleRow): boolean {
    const initial = this.liveInitial;
    const saved = initial?.raffles?.find((entry) => entry.id === row.id);
    if (!saved) return false;
    // The roll also reads the *stored* tracker wiring and winner-exclusion flag,
    // so unsaved edits to either would draw against stale config even when this
    // row's own fields match. Gate on those too, and on the prize identity, so a
    // roll only ever reflects exactly what the server holds.
    const eventConfigUnchanged =
      this.trackerEnabled === (initial?.tracker !== undefined) &&
      this.trackerEventId === (initial?.tracker?.eventId ?? "") &&
      this.trackerTracking === (initial?.tracker?.tracking ?? "api") &&
      this.raffleExcludeWinners === (initial?.raffleExcludeWinners ?? false);
    // The roll resolves milestone rules to the *stored* targets, so every
    // referenced milestone's target must match what the server holds - an
    // unsaved edit to one would draw against a stale threshold.
    const milestoneTargetsUnchanged = row.rules.every((rule) => {
      if (rule.type !== "milestone" || !rule.milestoneId) return true;
      return (
        toCount(this.personalMilestones.find((entry) => entry.id === rule.milestoneId)?.at) ===
        initial?.personalMilestones?.find((entry) => entry.id === rule.milestoneId)?.at
      );
    });
    // The whole pool definition is draw-affecting. Compare through the same
    // serializer both sides, so a stored legacy raffle (no eligibility yet)
    // compares against its own builder equivalent and stays rollable until
    // actually edited.
    const savedMilestoneIds = new Set(
      (initial?.personalMilestones ?? []).map((milestone) => milestone.id),
    );
    const currentMilestoneIds = new Set(
      this.personalMilestones.filter((entry) => hasCount(entry.at) || entry.unlock.trim()).map((entry) => entry.id),
    );
    const eligibilityUnchanged =
      JSON.stringify(this.rowEligibility(row, currentMilestoneIds)) ===
      JSON.stringify(this.rowEligibility(this.seedRaffleRow(saved), savedMilestoneIds));
    return (
      eventConfigUnchanged &&
      milestoneTargetsUnchanged &&
      eligibilityUnchanged &&
      row.prize.trim() === saved.prize &&
      toCount(row.winnerCount) === saved.winnerCount
    );
  }

  // Flattens every raffle into one winner-slot per row for the results table:
  // a raffle with three winners becomes three rows sharing its prize.
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

  // Milestones a raffle gate can point at: only rows with a real target, since a
  // gate is a raid threshold - an unlock-only row (no `at`) would serialize to a
  // NaN target and fail the save-time validator. A raffle keeps a gate whose row
  // was emptied but not removed.
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

  // The same validator the server runs, so problems surface before submitting.
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
    // An icon shown nowhere is no icon - unchecking every placement clears
    // it instead of leaving an unsubmittable draft.
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
          // Rows added but left fully empty are noise, not intent.
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
    // Rows added but left fully empty are noise, not intent - drop them, and
    // keep the stable id so a raffle gate keeps pointing at the same milestone.
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
    // Rows added but left fully empty are noise, not intent - drop them,
    // along with the local row ids. A picked player stands in for a missing
    // display name.
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
    // Rows added but left fully empty are noise; drop them so an untouched
    // "+ Add raffle" click never fails the save on a missing prize. The
    // winner-count/weight defaults are always present, so they can't signal
    // intent - a row counts once it has a prize, a window, rules, manual
    // picks, or frozen winners (the last keeps a save from ever wiping a
    // rolled result).
    const filledMilestoneIds = new Set(filledMilestones.map((entry) => entry.id));
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
        const eligibility = this.rowEligibility(row, filledMilestoneIds);
        const raffle: Record<string, unknown> = {
          id: row.id,
          prize: row.prize,
          winnerCount: toCount(row.winnerCount),
          // Rollback mirror: old code ignores `eligibility` and reads these
          // legacy fields, so a per-raid raffle degrades to its exact legacy
          // equivalent instead of vanishing or drawing everyone.
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
        // Shrinking the winner count drops the now-orphaned slots' winners.
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
    return event;
  });

  readonly parsed = $derived(parseGuildEvent(this.draftEvent));
  readonly liveError = $derived(this.parsed.ok ? null : this.parsed.error);
  readonly payload = $derived(JSON.stringify({ event: this.draftEvent, published: this.published }));
  readonly previewGoals = $derived(this.parsed.ok ? (this.parsed.event.goals ?? []) : []);

  readonly selectedTracker = $derived(
    this.trackerChoices.find((option) => option.id === this.trackerEventId) ?? null,
  );

  readonly trackerDraftError = $derived.by(() => {
    if (!this.newTrackerName.trim()) return "the tracker needs a name";
    if (!this.newTrackerStarts || !this.newTrackerEnds) return "the tracker needs a start and an end";
    const starts = Date.parse(toInstant(this.newTrackerStarts));
    const ends = Date.parse(toInstant(this.newTrackerEnds));
    // A malformed time (e.g. 25:00) parses to NaN, and NaN comparisons are
    // silently false - reject it explicitly.
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

  // ── Tracker helpers ─────────────────────────────────────────────────

  /** Seeds the tracker creator from what the event already knows. */
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

  /** Prefills the editor with the selected tracker for editing. */
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
    this.newTrackerRaid = option.raid ?? "";
    this.trackerAttempted = false;
    this.trackerEditor = "edit";
  }

  syncSlug() {
    if (this.mode === "create" && !this.slugEdited) this.slug = slugify(this.name);
  }

  /**
   * Picking a tracker event also decides how it is tracked. Reads the id off
   * the select itself - the change handler can run before bind:value has
   * written the new selection back to state.
   */
  syncTracking(id: string) {
    const option = this.trackerChoices.find((entry) => entry.id === id);
    if (option) this.trackerTracking = option.tracking;
  }

  /** A manually typed id that the picker cannot show must not be submitted. */
  leaveManualMode() {
    if (this.trackerChoices.some((entry) => entry.id === this.trackerEventId)) {
      this.syncTracking(this.trackerEventId);
    } else {
      this.trackerEventId = "";
    }
    this.trackerManual = false;
  }

  // ── Undo / redo ─────────────────────────────────────────────────────
  // Snapshots are the same draft JSON the form submits, captured after a
  // short quiet period; undo replays one through applyDraft. No keyboard
  // shortcuts - Ctrl+Z inside a text field must stay the native text undo.
  static readonly HISTORY_LIMIT = 60;
  static readonly CAPTURE_QUIET_MS = 600;
  undoStack = $state<string[]>([]);
  redoStack = $state<string[]>([]);
  lastCaptured = $state("");
  private captureTimer: ReturnType<typeof setTimeout> | undefined;

  /** Debounces a capture of `current`; EventEditor calls this from its effect. */
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
      // An in-progress edit undoes to the last settled draft and stays
      // redoable - and, like any new edit, it abandons the old redo branch.
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
      // Typing after an undo invalidates the redo branch, like any editor.
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

  /** Rehydrates every field from a draft event object; the inverse of draftEvent. */
  applyDraft(draft: Record<string, unknown>, keepSlug: boolean) {
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const count = (value: unknown): string | number =>
      typeof value === "number" && Number.isFinite(value) ? value : "";
    if (!keepSlug) {
      this.slug = text(draft.slug);
      // A slug that still matches its name was never hand-edited - keep
      // auto-slug mode alive across replays.
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
    // No icon resets the placements, so the next pick defaults to hero.
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
        // A snapshot missing an id (hand-edited preset) still needs a stable one.
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
    this.trackerTracking = trackerDraft && trackerDraft.tracking === "mod" ? "mod" : "api";
    this.trackerManual =
      this.trackerChoices.length === 0 ||
      (this.trackerEnabled && !this.trackerChoices.some((option) => option.id === this.trackerEventId));
    const rafflesDraft = Array.isArray(draft.raffles) ? draft.raffles : [];
    this.raffles = rafflesDraft.map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const windowRecord = (record.window ?? null) as Record<string, unknown> | null;
      const winnersDraft = Array.isArray(record.winners) ? record.winners : [];
      return this.seedRaffleRow({
        // A snapshot missing an id (hand-edited preset) still needs a stable one.
        id: text(record.id) || crypto.randomUUID(),
        prize: text(record.prize),
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
        // Snapshots come from this editor's own serialization; a hand-edited
        // preset still lands in the server validator on save.
        eligibility:
          record.eligibility && typeof record.eligibility === "object"
            ? (record.eligibility as RaffleEligibility)
            : undefined,
      });
    });
    this.raffleExcludeWinners = draft.raffleExcludeWinners === true;
  }

  // ── Presets ─────────────────────────────────────────────────────────

  loadPreset() {
    const preset = this.presetChoices.find((entry) => entry.name === this.selectedPreset);
    if (!preset) return;
    let draft: Record<string, unknown>;
    try {
      draft = JSON.parse(preset.payload) as Record<string, unknown>;
    } catch {
      return;
    }
    // Loading is an edit like any other - one undo step returns here.
    this.cancelCapture();
    this.capture(this.payload);
    this.undoStack.push(this.lastCaptured);
    if (this.undoStack.length > EventDraft.HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.applySnapshot(JSON.stringify({ event: draft, published: this.published }));
  }

  /**
   * Adoption happens once, in the submission's own result callback - a
   * lingering form prop would replay it on every later toolbar interaction.
   */
  readonly presetSubmit: SubmitFunction = () => {
    const payloadAtSubmit = this.presetPayload;
    return async ({ result, update }) => {
      if (result.type === "success") {
        const saved = (result.data as { presetSaved?: unknown } | undefined)?.presetSaved;
        if (typeof saved === "string") {
          // Selection is about to move - an armed delete must not carry over.
          this.confirmingPresetDelete = false;
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
      this.confirmingPresetDelete = false;
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

  // ── Form submission ─────────────────────────────────────────────────

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
      // A roll persists a single slot server-side; reflect the frozen winner
      // onto that slot so the editor updates without a reseed.
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
          // Adopt exactly the version this roll wrote (reflected above) - not
          // the reloaded page data, which may already contain someone else's
          // later save.
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
      // Adopt exactly the version this save wrote - not the reloaded page
      // data, which may already contain someone else's later save.
      if (result.type === "success") {
        const data = result.data as { newUpdatedAt?: number } | undefined;
        this.knownUpdatedAt = data?.newUpdatedAt ?? this.knownUpdatedAt;
      }
      await update({ reset: false });
    };
  };
}
