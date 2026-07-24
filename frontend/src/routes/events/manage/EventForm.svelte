<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";

  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import InstantField from "./InstantField.svelte";
  import EventSky from "$lib/events/components/EventSky.svelte";
  import GoalMeter from "$lib/events/components/GoalMeter.svelte";
  import { RAID_ICONS, raidIconUrl } from "$lib/events/raidIcons";
  import type {
    CompRole,
    EventIconPlacement,
    EventTheme,
    GuildEvent,
    PrizeEntry,
    RaffleWinner,
  } from "$lib/events/types";
  import { parseGuildEvent } from "$lib/events/validate";
  import type { EventFormContext, TrackerOption } from "$lib/server/eventFormContext";
  import { KNOWN_RAIDS } from "$lib/site/raids";

  let {
    mode,
    initial = null,
    initialPublished = false,
    initialUpdatedAt = null,
    context = null,
    error = null,
    saved = false,
    trackerCreated = null,
    trackerUpdated = null,
    trackerError = null,
    presetError = null,
    auditWarning = false,
  }: {
    mode: "create" | "edit";
    initial?: GuildEvent | null;
    initialPublished?: boolean;
    /** Stored version the form loaded from; sent back so the save can reject a
     * stale draft that would clobber a concurrent edit or roll. */
    initialUpdatedAt?: number | null;
    /** Picker data (roster, tracker events); the form degrades without it. */
    context?: EventFormContext | null;
    /** Rejection from the last server submission. */
    error?: string | null;
    saved?: boolean;
    /** Result of the last ?/createTracker submission. */
    trackerCreated?: TrackerOption | null;
    /** Result of the last ?/updateTracker submission. */
    trackerUpdated?: TrackerOption | null;
    trackerError?: string | null;
    presetError?: string | null;
    /** The last action succeeded but its audit row did not land. */
    auditWarning?: boolean;
  } = $props();

  // The form deliberately seeds from the props once - the parent remounts it
  // via {#key} when the event changes.
  // svelte-ignore state_referenced_locally
  const seed = initial;
  // svelte-ignore state_referenced_locally
  const seedPublished = initialPublished;
  // The version token the visible draft is based on. Every enhanced action
  // reruns `load` and refreshes `initialUpdatedAt`, so using the live prop
  // would adopt a concurrent manager's version after e.g. a tracker or preset
  // action - letting this editor save or delete over content it never
  // displayed. Seeded at mount, advanced only by this tab's own successful
  // saves and rolls (after which the visible draft matches the store again).
  // svelte-ignore state_referenced_locally
  let knownUpdatedAt = $state(initialUpdatedAt);
  // svelte-ignore state_referenced_locally
  const memberChoices = context?.members ?? [];
  // svelte-ignore state_referenced_locally
  let trackerChoices = $state(context?.trackerEvents ?? []);

  let name = $state(seed?.name ?? "");
  let slug = $state(seed?.slug ?? "");
  let slugEdited = $state(false);
  let tagline = $state(seed?.tagline ?? "");
  let access = $state<"public" | "members">(seed?.access ?? "members");
  let published = $state(seedPublished);
  // Original instants survive untouched edits - datetime-local inputs carry
  // minute precision, and rewriting an unchanged value would shift seconds.
  // Reassigned by applyDraft so replayed snapshots keep THEIR exact seconds,
  // not the originally loaded event's.
  let seedStartsAt = $state(seed?.startsAt ?? "");
  let seedEndsAt = $state(seed?.endsAt ?? "");
  let startsAt = $state(toInput(seed?.startsAt));
  let endsAt = $state(toInput(seed?.endsAt));

  let skyTop = $state(seed?.theme.sky[0] ?? "#171120");
  let skyBottom = $state(seed?.theme.sky[1] ?? "#251b38");
  let accent = $state(seed?.theme.accent ?? "#a78bfa");
  let accentSecondary = $state(seed?.theme.accentSecondary ?? "#8fb2f0");
  let star = $state(seed?.theme.star ?? "#c4b5fd");

  // Placements serialize in this fixed order, so click order never churns
  // the payload (and with it the undo history).
  const ICON_PLACEMENT_ORDER: EventIconPlacement[] = ["hero", "band", "meta", "manage"];
  let iconFile = $state(seed?.icon?.file ?? "");
  let iconPlacements = $state<EventIconPlacement[]>(seed?.icon?.placements ?? ["hero"]);

  let about = $state(seed?.about?.join("\n\n") ?? "");
  // Repeater rows carry a locally generated id so the each blocks are keyed -
  // unkeyed lists with two-way bindings corrupt state when middle rows are
  // removed.
  let nextRowId = 0;

  type GoalSource = "manual" | "raids" | "raidRuns" | "wars" | "playtime";
  interface MilestoneRow {
    id: number;
    // Number inputs bind numbers (or null when cleared), not strings.
    at: string | number | null | undefined;
    unlock: string;
  }
  interface GoalRow {
    id: number;
    metric: string;
    source: GoalSource;
    raid: string;
    finalTotal: string | number | null | undefined;
    milestones: MilestoneRow[];
    /** Preview slider position as a percentage of the last milestone. */
    previewPercent: number;
  }

  function newMilestoneRow(): MilestoneRow {
    return { id: nextRowId++, at: "", unlock: "" };
  }

  function newGoalRow(): GoalRow {
    return {
      id: nextRowId++,
      metric: "",
      source: "manual",
      raid: "",
      finalTotal: "",
      milestones: [newMilestoneRow()],
      previewPercent: 60,
    };
  }

  let goalEnabled = $state((seed?.goals?.length ?? 0) > 0);
  let goals = $state<GoalRow[]>(
    seed?.goals?.map((goal) => ({
      id: nextRowId++,
      metric: goal.metricLabel,
      source: goal.feed ?? "manual",
      raid: goal.countRaid ?? "",
      finalTotal: goal.finalTotal ?? "",
      milestones: goal.milestones.map((milestone) => ({
        id: nextRowId++,
        at: milestone.at,
        unlock: milestone.unlock,
      })),
      previewPercent: 60,
    })) ?? [],
  );
  // ── Personal milestones ─────────────────────────────────────────────
  // Per-member raid thresholds. Each row carries a stable id (like a raffle)
  // so a raffle's milestone gate can reference it across saves and undo.
  interface PersonalMilestoneRow {
    /** Stable id persisted in the event JSON and targeted by raffle gates. */
    id: string;
    /** Local list key, distinct from the persisted id. */
    key: number;
    at: string | number | null | undefined;
    unlock: string;
  }

  function newPersonalMilestoneRow(): PersonalMilestoneRow {
    return { id: crypto.randomUUID(), key: nextRowId++, at: "", unlock: "" };
  }

  let personalMilestones = $state<PersonalMilestoneRow[]>(
    seed?.personalMilestones?.map((milestone) => ({
      id: milestone.id,
      key: nextRowId++,
      at: milestone.at,
      unlock: milestone.unlock,
    })) ?? [],
  );

  // Chart source: "goal" follows the first raid-based goal, "raids"/"raidRuns"
  // chart raids explicitly, "off" hides the chart; chartRaid narrows to one raid.
  let chartSource = $state<"goal" | "raids" | "raidRuns" | "off">(
    seed?.activity ? (seed.activity.source === "none" ? "off" : seed.activity.source) : "goal",
  );
  let chartRaid = $state(seed?.activity?.countRaid ?? "");
  let prizes = $state<(Required<PrizeEntry> & { id: number })[]>(
    seed?.prizes?.map((entry) => ({
      ...entry,
      donorPlayer: entry.donorPlayer ?? "",
      id: nextRowId++,
    })) ?? [],
  );
  let prizesNote = $state(seed?.prizesNote ?? "");
  let compRoles = $state<(CompRole & { id: number })[]>(
    seed?.comp?.roles.map((role) => ({ ...role, note: role.note ?? "", id: nextRowId++ })) ?? [],
  );
  let compNote = $state(seed?.comp?.note ?? "");
  let rules = $state(seed?.rules?.join("\n") ?? "");
  let trackerEnabled = $state(seed?.tracker !== undefined);
  let trackerEventId = $state(seed?.tracker?.eventId ?? "");
  let trackerTracking = $state<"api" | "mod">(seed?.tracker?.tracking ?? "api");
  // Manual id entry is the fallback when the backend list is unavailable or
  // the stored id is not in it.
  let trackerManual = $state(
    trackerChoices.length === 0 ||
      (seed?.tracker !== undefined &&
        !trackerChoices.some((option) => option.id === seed.tracker?.eventId)),
  );

  // ── Raffles ─────────────────────────────────────────────────────────
  interface RaffleRow {
    /** Stable id that persists in the event JSON and targets rolls. */
    id: string;
    /** Local list key, distinct from the persisted id. */
    key: number;
    prize: string;
    winnerCount: string | number | null | undefined;
    perTicket: string | number | null | undefined;
    windowFrom: string;
    windowTo: string;
    /** Original window instants, so an untouched field keeps its seconds. */
    seedWindowFrom: string;
    seedWindowTo: string;
    /** Frozen roll results, edited only by rolling - passed through on save. */
    winners: RaffleWinner[];
    drawnAt: string;
    /** PersonalMilestone id required to enter, or "" for no gate. */
    requiresMilestone: string;
  }

  function newRaffleRow(): RaffleRow {
    return {
      id: crypto.randomUUID(),
      key: nextRowId++,
      prize: "",
      winnerCount: 1,
      perTicket: 5,
      windowFrom: "",
      windowTo: "",
      seedWindowFrom: "",
      seedWindowTo: "",
      winners: [],
      drawnAt: "",
      requiresMilestone: "",
    };
  }

  // Only raffles that already exist server-side can be rolled - a fresh row
  // must be saved first. Derived from the live `initial` prop (not the mount
  // snapshot) so a save that adds a raffle unlocks its roll button without a
  // full reload; undo never touches `initial`, so it stays out of the picture.
  const seedRaffleIds = $derived(new Set((initial?.raffles ?? []).map((raffle) => raffle.id)));
  let raffleExcludeWinners = $state(seed?.raffleExcludeWinners ?? false);
  let raffles = $state<RaffleRow[]>(
    seed?.raffles?.map((raffle) => ({
      id: raffle.id,
      key: nextRowId++,
      prize: raffle.prize,
      winnerCount: raffle.winnerCount,
      perTicket: raffle.perTicket,
      windowFrom: toInput(raffle.window?.from),
      windowTo: toInput(raffle.window?.to),
      seedWindowFrom: raffle.window?.from ?? "",
      seedWindowTo: raffle.window?.to ?? "",
      winners: raffle.winners ?? [],
      drawnAt: raffle.drawnAt ?? "",
      requiresMilestone: raffle.requiresMilestone ?? "",
    })) ?? [],
  );
  let rollingId = $state<string | null>(null);
  let rollError = $state<string | null>(null);

  // A saved raffle is only rollable while its draw-affecting config matches what
  // the server holds: the roll runs against the stored winnerCount/perTicket/
  // window, so unsaved edits to those would silently draw against stale values.
  function raffleConfigUnchanged(row: RaffleRow): boolean {
    const saved = initial?.raffles?.find((entry) => entry.id === row.id);
    if (!saved) return false;
    // The roll also reads the *stored* tracker wiring and winner-exclusion flag,
    // so unsaved edits to either would draw against stale config even when this
    // row's own fields match. Gate on those too, and on the prize identity, so a
    // roll only ever reflects exactly what the server holds.
    const eventConfigUnchanged =
      trackerEnabled === (initial?.tracker !== undefined) &&
      trackerEventId === (initial?.tracker?.eventId ?? "") &&
      trackerTracking === (initial?.tracker?.tracking ?? "api") &&
      raffleExcludeWinners === (initial?.raffleExcludeWinners ?? false);
    // The roll resolves this raffle's gate to the *stored* milestone target, so
    // both the gate choice and (when gated) the referenced milestone's target
    // must match what the server holds - an unsaved edit to either would draw
    // against a stale threshold.
    const gate = row.requiresMilestone || "";
    const savedGate = saved.requiresMilestone ?? "";
    const gateTargetUnchanged =
      gate === "" ||
      toCount(personalMilestones.find((entry) => entry.id === gate)?.at) ===
        initial?.personalMilestones?.find((entry) => entry.id === gate)?.at;
    return (
      eventConfigUnchanged &&
      gate === savedGate &&
      gateTargetUnchanged &&
      row.prize.trim() === saved.prize &&
      toCount(row.winnerCount) === saved.winnerCount &&
      toCount(row.perTicket) === saved.perTicket &&
      row.windowFrom === toInput(saved.window?.from) &&
      row.windowTo === toInput(saved.window?.to)
    );
  }

  // Flattens every raffle into one winner-slot per row for the results table:
  // a raffle with three winners becomes three rows sharing its prize.
  const RAFFLE_MAX_WINNERS = 50;
  const raffleSlots = $derived.by(() =>
    raffles.flatMap((row) => {
      const count = Math.max(0, Math.min(RAFFLE_MAX_WINNERS, Math.floor(Number(toCount(row.winnerCount)) || 0)));
      const saved = seedRaffleIds.has(row.id) && raffleConfigUnchanged(row);
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
  const milestoneOptions = $derived(
    personalMilestones
      .filter((row) => hasCount(row.at))
      .map((row) => ({
        id: row.id,
        label: `${row.unlock.trim() || "Milestone"} (≥${toCount(row.at)} raids)`,
      })),
  );

  // Removing or emptying a personal milestone drops it from milestoneOptions;
  // clear any raffle gate that pointed at it so the picker visibly resets and no
  // stale id lingers until serialization. Setting "" is stable (falsy, so the
  // effect no-ops on its own re-run).
  $effect(() => {
    const valid = new Set(milestoneOptions.map((option) => option.id));
    for (const raffle of raffles) {
      if (raffle.requiresMilestone && !valid.has(raffle.requiresMilestone)) {
        raffle.requiresMilestone = "";
      }
    }
  });

  let showValidation = $state(false);
  let saving = $state(false);
  let confirmingDelete = $state(false);

  // Inline tracker editor inside the standings section - creates new
  // tracker events or edits the selected one.
  let trackerEditor = $state<"closed" | "create" | "edit">("closed");
  let trackerEditId = $state("");
  let trackerEditStartsAt = $state("");
  let trackerEditEndsAt = $state("");
  let trackerBusy = $state(false);
  let trackerAttempted = $state(false);
  let newTrackerName = $state("");
  let newTrackerStarts = $state("");
  let newTrackerEnds = $state("");
  let newTrackerTracking = $state<"api" | "mod">("mod");
  let newTrackerRaid = $state("");

  // Adopt a tracker the server just created: list it and select it.
  $effect(() => {
    const created = trackerCreated;
    if (created && !trackerChoices.some((option) => option.id === created.id)) {
      trackerChoices.push(created);
      trackerEventId = created.id;
      trackerTracking = created.tracking;
      trackerManual = false;
      trackerEditor = "closed";
    }
  });

  // Reflect a server-side tracker update into the picker list. The editor
  // closes on any update response - a no-op save is still a successful save.
  // Only the list mutation is guarded by equality, so the effect settles.
  $effect(() => {
    const updated = trackerUpdated;
    if (!updated) return;
    trackerEditor = "closed";
    const index = trackerChoices.findIndex((option) => option.id === updated.id);
    if (index >= 0 && JSON.stringify(trackerChoices[index]) !== JSON.stringify(updated)) {
      trackerChoices[index] = updated;
      if (trackerEventId === updated.id) trackerTracking = updated.tracking;
    }
  });

  const theme = $derived<EventTheme>({
    sky: [skyTop, skyBottom],
    accent,
    accentSecondary,
    star,
  });

  // The same validator the server runs, so problems surface before submitting.
  const draftEvent = $derived.by(() => {
    const event: Record<string, unknown> = { slug: slug.trim(), name, tagline, access, theme };
    if (startsAt) event.startsAt = keepInstant(startsAt, seedStartsAt);
    if (endsAt) event.endsAt = keepInstant(endsAt, seedEndsAt);
    // An icon shown nowhere is no icon - unchecking every placement clears
    // it instead of leaving an unsubmittable draft.
    if (iconFile && iconPlacements.length > 0) {
      event.icon = {
        file: iconFile,
        placements: ICON_PLACEMENT_ORDER.filter((placement) => iconPlacements.includes(placement)),
      };
    }
    const paragraphs = splitParagraphs(about);
    if (paragraphs.length > 0) event.about = paragraphs;
    if (goalEnabled && goals.length > 0) {
      event.goals = goals.map((row) => {
        const goal: Record<string, unknown> = {
          metricLabel: row.metric,
          // Rows added but left fully empty are noise, not intent.
          milestones: row.milestones
            .filter((milestone) => hasCount(milestone.at) || milestone.unlock.trim())
            .map((milestone) => ({ at: toCount(milestone.at), unlock: milestone.unlock })),
        };
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
    const filledMilestones = personalMilestones
      .filter((row) => hasCount(row.at) || row.unlock.trim())
      .map((row) => ({ id: row.id, at: toCount(row.at), unlock: row.unlock }));
    if (filledMilestones.length > 0) event.personalMilestones = filledMilestones;
    if (chartSource === "off") event.activity = { source: "none" };
    else if (chartSource !== "goal") {
      event.activity = chartRaid
        ? { source: chartSource, countRaid: chartRaid }
        : { source: chartSource };
    }
    // Rows added but left fully empty are noise, not intent - drop them,
    // along with the local row ids. A picked player stands in for a missing
    // display name.
    const filledPrizes = prizes
      .filter((entry) => entry.donor.trim() || entry.prize.trim() || entry.donorPlayer.trim())
      .map(({ donor, prize, donorPlayer }) => ({
        donor: donor.trim() || donorPlayer.trim(),
        prize,
        donorPlayer: donorPlayer.trim() || undefined,
      }));
    if (filledPrizes.length > 0) event.prizes = filledPrizes;
    if (prizesNote.trim()) event.prizesNote = prizesNote;
    const filledRoles = compRoles
      .filter((entry) => entry.role.trim() || entry.builds.trim() || entry.note?.trim())
      .map(({ role, builds, note }) => ({ role, builds, note }));
    if (filledRoles.length > 0) {
      event.comp = compNote.trim() ? { roles: filledRoles, note: compNote } : { roles: filledRoles };
    }
    const ruleLines = splitLines(rules);
    if (ruleLines.length > 0) event.rules = ruleLines;
    if (trackerEnabled) event.tracker = { eventId: trackerEventId, tracking: trackerTracking };
    // Rows added but left fully empty are noise; drop them so an untouched
    // "+ Add raffle" click never fails the save on a missing prize. The
    // winner-count/raids-per-ticket defaults are always present, so they can't
    // signal intent - a row counts only once it has a prize, a window, or
    // frozen winners (the last keeps a save from ever wiping a rolled result).
    const filledRaffles = raffles
      .filter((row) => row.prize.trim() || row.windowFrom || row.windowTo || row.winners.length > 0)
      .map((row) => {
        const raffle: Record<string, unknown> = {
          id: row.id,
          prize: row.prize,
          winnerCount: toCount(row.winnerCount),
          perTicket: toCount(row.perTicket),
        };
        // Serialize the window when either bound is set, not only both, so a
        // one-sided window reaches the validator (which rejects the empty bound)
        // instead of silently vanishing.
        if (row.windowFrom || row.windowTo) {
          raffle.window = {
            from: keepInstant(row.windowFrom, row.seedWindowFrom),
            to: keepInstant(row.windowTo, row.seedWindowTo),
          };
        }
        // Shrinking the winner count drops the now-orphaned slots' winners.
        const winnerCount = toCount(row.winnerCount);
        const keptWinners = row.winners.filter(
          (winner) => Number.isInteger(winner.slot) && winner.slot < winnerCount,
        );
        if (keptWinners.length > 0) raffle.winners = keptWinners;
        if (keptWinners.length > 0 && row.drawnAt) raffle.drawnAt = row.drawnAt;
        // Only emit a gate that still points at a live milestone - a milestone
        // deleted after being picked would otherwise fail validation as dangling.
        if (row.requiresMilestone && filledMilestones.some((m) => m.id === row.requiresMilestone)) {
          raffle.requiresMilestone = row.requiresMilestone;
        }
        return raffle;
      });
    if (filledRaffles.length > 0) event.raffles = filledRaffles;
    if (raffleExcludeWinners) event.raffleExcludeWinners = true;
    return event;
  });

  function raidOptionsFor(selected: string): string[] {
    const names = KNOWN_RAIDS.map((raid) => raid.key);
    return selected && !names.includes(selected) ? [...names, selected] : names;
  }

  const chartRaidOptions = $derived.by(() => {
    const names = KNOWN_RAIDS.map((raid) => raid.key);
    return chartRaid && !names.includes(chartRaid) ? [...names, chartRaid] : names;
  });

  const parsed = $derived(parseGuildEvent(draftEvent));
  const liveError = $derived(parsed.ok ? null : parsed.error);
  const payload = $derived(JSON.stringify({ event: draftEvent, published }));
  const previewGoals = $derived(parsed.ok ? (parsed.event.goals ?? []) : []);

  const selectedTracker = $derived(
    trackerChoices.find((option) => option.id === trackerEventId) ?? null,
  );

  const trackerDraftError = $derived.by(() => {
    if (!newTrackerName.trim()) return "the tracker needs a name";
    if (!newTrackerStarts || !newTrackerEnds) return "the tracker needs a start and an end";
    const starts = Date.parse(toInstant(newTrackerStarts));
    const ends = Date.parse(toInstant(newTrackerEnds));
    // A malformed time (e.g. 25:00) parses to NaN, and NaN comparisons are
    // silently false - reject it explicitly.
    if (Number.isNaN(starts) || Number.isNaN(ends)) return "tracker times must be valid HH:MM";
    if (starts >= ends) return "the tracker must end after it starts";
    return null;
  });

  const trackerPayload = $derived(
    JSON.stringify({
      id: trackerEditor === "edit" ? trackerEditId : undefined,
      name: newTrackerName,
      startsAt: newTrackerStarts ? keepInstant(newTrackerStarts, trackerEditStartsAt) : "",
      endsAt: newTrackerEnds ? keepInstant(newTrackerEnds, trackerEditEndsAt) : "",
      tracking: newTrackerTracking,
      raid: newTrackerTracking === "mod" ? newTrackerRaid : "",
    }),
  );

  const submit: SubmitFunction = ({ action, cancel, formData }) => {
    if (action.search.includes("createTracker") || action.search.includes("updateTracker")) {
      trackerAttempted = true;
      if (trackerDraftError) {
        cancel();
        return;
      }
      trackerBusy = true;
      return async ({ update }) => {
        trackerBusy = false;
        await update({ reset: false });
      };
    }
    if (action.search.includes("rollRaffle")) {
      rollError = null;
      // Mark the roll in flight here, not in the button's onclick: disabling a
      // submit button from within its own click handler makes Svelte flush the
      // `disabled` update before the browser dispatches the submit, cancelling
      // it. By the time enhance calls submit, the submission is already ours to
      // keep, so disabling the buttons now is safe.
      rollingId = String(formData.get("rollTarget") ?? "pending");
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
          const row = raffles.find((entry) => entry.id === data?.rolled);
          if (row && data?.winner && typeof data.slot === "number") {
            row.winners = [...row.winners.filter((entry) => entry.slot !== data.slot), data.winner];
            row.drawnAt = data.drawnAt ?? new Date().toISOString();
          }
          // Adopt exactly the version this roll wrote (reflected above) - not
          // the reloaded page data, which may already contain someone else's
          // later save.
          knownUpdatedAt = data?.newUpdatedAt ?? knownUpdatedAt;
        } else if (result.type === "failure") {
          rollError = (result.data as { error?: string } | undefined)?.error ?? "The roll failed.";
        }
        rollingId = null;
        await update({ reset: false });
      };
    }
    showValidation = true;
    if (liveError) {
      cancel();
      return;
    }
    saving = true;
    return async ({ result, update }) => {
      saving = false;
      // Adopt exactly the version this save wrote - not the reloaded page
      // data, which may already contain someone else's later save.
      if (result.type === "success") {
        const data = result.data as { newUpdatedAt?: number } | undefined;
        knownUpdatedAt = data?.newUpdatedAt ?? knownUpdatedAt;
      }
      await update({ reset: false });
    };
  };

  /** Seeds the tracker creator from what the event already knows. */
  function openTrackerCreator() {
    newTrackerName = newTrackerName || name || "";
    newTrackerStarts = newTrackerStarts || startsAt;
    newTrackerEnds = newTrackerEnds || endsAt;
    newTrackerTracking = "mod";
    trackerEditId = "";
    trackerEditStartsAt = "";
    trackerEditEndsAt = "";
    trackerAttempted = false;
    trackerEditor = "create";
  }

  /** Prefills the editor with the selected tracker for editing. */
  function openTrackerEdit() {
    const option = selectedTracker;
    if (!option) return;
    trackerEditId = option.id;
    trackerEditStartsAt = option.startsAt;
    trackerEditEndsAt = option.endsAt;
    newTrackerName = option.name;
    newTrackerStarts = option.startsAt.slice(0, 16);
    newTrackerEnds = option.endsAt.slice(0, 16);
    newTrackerTracking = option.tracking;
    newTrackerRaid = option.raid ?? "";
    trackerAttempted = false;
    trackerEditor = "edit";
  }

  function syncSlug() {
    if (mode === "create" && !slugEdited) slug = slugify(name);
  }

  /**
   * Picking a tracker event also decides how it is tracked. Reads the id off
   * the select itself - the change handler can run before bind:value has
   * written the new selection back to state.
   */
  function syncTracking(id: string) {
    const option = trackerChoices.find((entry) => entry.id === id);
    if (option) trackerTracking = option.tracking;
  }

  /** A manually typed id that the picker cannot show must not be submitted. */
  function leaveManualMode() {
    if (trackerChoices.some((entry) => entry.id === trackerEventId)) {
      syncTracking(trackerEventId);
    } else {
      trackerEventId = "";
    }
    trackerManual = false;
  }

  function toInput(instant?: string): string {
    return instant ? instant.slice(0, 16) : "";
  }

  /** datetime-local values are read as UTC wall time. */
  function toInstant(value: string): string {
    return value.length === 16 ? `${value}:00Z` : `${value}Z`;
  }

  /** An untouched input keeps its original instant, seconds and all. */
  function keepInstant(value: string, original: string): string {
    return original && value === toInput(original) ? original : toInstant(value);
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

  // Cleared or invalid number inputs bind null or undefined depending on the
  // browser path - treat both as empty.
  function hasCount(value: string | number | null | undefined): boolean {
    if (value === null || value === undefined) return false;
    return typeof value === "number" ? Number.isFinite(value) : value.trim() !== "";
  }

  function toCount(value: string | number | null | undefined): number {
    if (typeof value === "number") return value;
    const text = (value ?? "").trim();
    return text === "" ? Number.NaN : Number(text);
  }

  // ── Undo / redo ─────────────────────────────────────────────────────
  // Snapshots are the same draft JSON the form submits, captured after a
  // short quiet period; undo replays one through applyDraft. No keyboard
  // shortcuts - Ctrl+Z inside a text field must stay the native text undo.
  const HISTORY_LIMIT = 60;
  const CAPTURE_QUIET_MS = 600;
  let undoStack = $state<string[]>([]);
  let redoStack = $state<string[]>([]);
  // svelte-ignore state_referenced_locally
  let lastCaptured = $state(payload);
  let captureTimer: ReturnType<typeof setTimeout> | undefined;

  // Replayed snapshots need no suppression flag: applySnapshot re-points
  // lastCaptured at the applied state, so the debounced capture no-ops on
  // equality, while a real edit in the quiet window still differs and lands.
  $effect(() => {
    const current = payload;
    clearTimeout(captureTimer);
    captureTimer = setTimeout(() => capture(current), CAPTURE_QUIET_MS);
    return () => clearTimeout(captureTimer);
  });

  function capture(current: string) {
    if (current === lastCaptured) return;
    undoStack.push(lastCaptured);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    if (redoStack.length > 0) redoStack.length = 0;
    lastCaptured = current;
  }

  const hasPendingEdit = $derived(payload !== lastCaptured);

  function undo() {
    clearTimeout(captureTimer);
    if (hasPendingEdit) {
      // An in-progress edit undoes to the last settled draft and stays
      // redoable - and, like any new edit, it abandons the old redo branch.
      redoStack.length = 0;
      redoStack.push(payload);
      applySnapshot(lastCaptured);
      return;
    }
    const previous = undoStack.pop();
    if (previous === undefined) return;
    redoStack.push(lastCaptured);
    applySnapshot(previous);
  }

  function redo() {
    clearTimeout(captureTimer);
    if (hasPendingEdit) {
      // Typing after an undo invalidates the redo branch, like any editor.
      capture(payload);
      return;
    }
    const next = redoStack.pop();
    if (next === undefined) return;
    undoStack.push(lastCaptured);
    applySnapshot(next);
  }

  function applySnapshot(snapshot: string) {
    const parsed = JSON.parse(snapshot) as { event?: Record<string, unknown>; published?: boolean };
    applyDraft(parsed.event ?? {}, mode === "edit");
    published = parsed.published === true;
    lastCaptured = payload;
  }

  /** Rehydrates every field from a draft event object; the inverse of draftEvent. */
  function applyDraft(draft: Record<string, unknown>, keepSlug: boolean) {
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const count = (value: unknown): string | number =>
      typeof value === "number" && Number.isFinite(value) ? value : "";
    if (!keepSlug) {
      slug = text(draft.slug);
      // A slug that still matches its name was never hand-edited - keep
      // auto-slug mode alive across replays.
      slugEdited = slug !== "" && slug !== slugify(text(draft.name));
    }
    name = text(draft.name);
    tagline = text(draft.tagline);
    access = draft.access === "public" ? "public" : "members";
    const themeDraft = (draft.theme ?? {}) as Record<string, unknown>;
    const sky = Array.isArray(themeDraft.sky) ? themeDraft.sky : [];
    skyTop = text(sky[0]) || "#171120";
    skyBottom = text(sky[1]) || "#251b38";
    accent = text(themeDraft.accent) || "#a78bfa";
    accentSecondary = text(themeDraft.accentSecondary) || "#8fb2f0";
    star = text(themeDraft.star) || "#c4b5fd";
    const iconDraft = (draft.icon ?? null) as Record<string, unknown> | null;
    iconFile = iconDraft ? text(iconDraft.file) : "";
    const placementsDraft = iconDraft && Array.isArray(iconDraft.placements) ? iconDraft.placements : null;
    // No icon resets the placements, so the next pick defaults to hero.
    iconPlacements = placementsDraft
      ? ICON_PLACEMENT_ORDER.filter((placement) => placementsDraft.includes(placement))
      : ["hero"];
    seedStartsAt = text(draft.startsAt);
    seedEndsAt = text(draft.endsAt);
    startsAt = seedStartsAt.slice(0, 16);
    endsAt = seedEndsAt.slice(0, 16);
    about = Array.isArray(draft.about)
      ? draft.about.filter((entry): entry is string => typeof entry === "string").join("\n\n")
      : "";
    const goalsDraft = Array.isArray(draft.goals) ? draft.goals : [];
    goalEnabled = goalsDraft.length > 0;
    goals = goalsDraft.map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const milestonesDraft = Array.isArray(record.milestones) && record.milestones.length > 0
        ? record.milestones
        : [{}];
      return {
        id: nextRowId++,
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
          return { id: nextRowId++, at: count(milestoneRecord.at), unlock: text(milestoneRecord.unlock) };
        }),
        previewPercent: 60,
      };
    });
    const milestonesDraft = Array.isArray(draft.personalMilestones) ? draft.personalMilestones : [];
    personalMilestones = milestonesDraft.map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      return {
        // A snapshot missing an id (hand-edited preset) still needs a stable one.
        id: text(record.id) || crypto.randomUUID(),
        key: nextRowId++,
        at: count(record.at),
        unlock: text(record.unlock),
      };
    });
    const activityDraft = (draft.activity ?? null) as Record<string, unknown> | null;
    chartSource = activityDraft
      ? activityDraft.source === "none"
        ? "off"
        : activityDraft.source === "raids" || activityDraft.source === "raidRuns"
          ? activityDraft.source
          : "goal"
      : "goal";
    chartRaid = activityDraft ? text(activityDraft.countRaid) : "";
    prizes = (Array.isArray(draft.prizes) ? draft.prizes : []).map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      return {
        donor: text(record.donor),
        prize: text(record.prize),
        donorPlayer: text(record.donorPlayer),
        id: nextRowId++,
      };
    });
    prizesNote = text(draft.prizesNote);
    const compDraft = (draft.comp ?? null) as Record<string, unknown> | null;
    compRoles = (compDraft && Array.isArray(compDraft.roles) ? compDraft.roles : []).map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      return { role: text(record.role), builds: text(record.builds), note: text(record.note), id: nextRowId++ };
    });
    compNote = compDraft ? text(compDraft.note) : "";
    rules = Array.isArray(draft.rules)
      ? draft.rules.filter((entry): entry is string => typeof entry === "string").join("\n")
      : "";
    const trackerDraft = (draft.tracker ?? null) as Record<string, unknown> | null;
    trackerEnabled = trackerDraft !== null;
    trackerEventId = trackerDraft ? text(trackerDraft.eventId) : "";
    trackerTracking = trackerDraft && trackerDraft.tracking === "mod" ? "mod" : "api";
    trackerManual =
      trackerChoices.length === 0 ||
      (trackerEnabled && !trackerChoices.some((option) => option.id === trackerEventId));
    const rafflesDraft = Array.isArray(draft.raffles) ? draft.raffles : [];
    raffles = rafflesDraft.map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const windowRecord = (record.window ?? null) as Record<string, unknown> | null;
      const from = windowRecord ? text(windowRecord.from) : "";
      const to = windowRecord ? text(windowRecord.to) : "";
      const winnersDraft = Array.isArray(record.winners) ? record.winners : [];
      return {
        // A snapshot missing an id (hand-edited preset) still needs a stable one.
        id: text(record.id) || crypto.randomUUID(),
        key: nextRowId++,
        prize: text(record.prize),
        winnerCount: count(record.winnerCount),
        perTicket: count(record.perTicket),
        windowFrom: from.slice(0, 16),
        windowTo: to.slice(0, 16),
        seedWindowFrom: from,
        seedWindowTo: to,
        winners: winnersDraft.map((winner) => {
          const winnerRecord = (winner ?? {}) as Record<string, unknown>;
          return {
            slot: typeof winnerRecord.slot === "number" ? winnerRecord.slot : 0,
            username: text(winnerRecord.username),
            player_uuid: text(winnerRecord.player_uuid),
            tickets: typeof winnerRecord.tickets === "number" ? winnerRecord.tickets : 0,
          };
        }),
        drawnAt: text(record.drawnAt),
        requiresMilestone: text(record.requiresMilestone),
      };
    });
    raffleExcludeWinners = draft.raffleExcludeWinners === true;
  }

  // ── Presets ─────────────────────────────────────────────────────────
  // svelte-ignore state_referenced_locally
  let presetChoices = $state(context?.presets ?? []);
  let selectedPreset = $state("");
  let newPresetName = $state("");
  let confirmingPresetDelete = $state(false);
  const presetPayload = $derived(JSON.stringify(draftEvent));

  function loadPreset() {
    const preset = presetChoices.find((entry) => entry.name === selectedPreset);
    if (!preset) return;
    let draft: Record<string, unknown>;
    try {
      draft = JSON.parse(preset.payload) as Record<string, unknown>;
    } catch {
      return;
    }
    // Loading is an edit like any other - one undo step returns here.
    clearTimeout(captureTimer);
    capture(payload);
    undoStack.push(lastCaptured);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    applySnapshot(JSON.stringify({ event: draft, published }));
  }

  /**
   * Adoption happens once, in the submission's own result callback - a
   * lingering form prop would replay it on every later toolbar interaction.
   */
  const presetSubmit: SubmitFunction = () => {
    const payloadAtSubmit = presetPayload;
    return async ({ result, update }) => {
      if (result.type === "success") {
        const saved = (result.data as { presetSaved?: unknown } | undefined)?.presetSaved;
        if (typeof saved === "string") {
          // Selection is about to move - an armed delete must not carry over.
          confirmingPresetDelete = false;
          const entry = { name: saved, payload: payloadAtSubmit, updatedAt: Date.now() };
          const index = presetChoices.findIndex((candidate) => candidate.name === saved);
          if (index >= 0) presetChoices[index] = entry;
          else {
            presetChoices.push(entry);
            presetChoices.sort((a, b) => a.name.localeCompare(b.name));
          }
          selectedPreset = saved;
          newPresetName = "";
        }
      }
      await update();
    };
  };

  const presetDelete: SubmitFunction = () => {
    return async ({ result, update }) => {
      confirmingPresetDelete = false;
      if (result.type === "success") {
        const deleted = (result.data as { presetDeleted?: unknown } | undefined)?.presetDeleted;
        if (typeof deleted === "string") {
          presetChoices = presetChoices.filter((candidate) => candidate.name !== deleted);
          if (selectedPreset === deleted) selectedPreset = "";
        }
      }
      await update();
    };
  };
</script>

<div class="mg-editor">
  <div class="mg-main">
    <div class="mg-toolbar">
      <div class="mg-history" role="group" aria-label="Edit history">
        <button
          type="button"
          class="seq-button seq-button-ghost seq-button-sm"
          onclick={undo}
          disabled={undoStack.length === 0 && !hasPendingEdit}
        >
          Undo
        </button>
        <button
          type="button"
          class="seq-button seq-button-ghost seq-button-sm"
          onclick={redo}
          disabled={redoStack.length === 0}
        >
          Redo
        </button>
      </div>
      <div class="mg-presets">
        <select
          class="mg-input mg-preset-select"
          bind:value={selectedPreset}
          onchange={() => (confirmingPresetDelete = false)}
          aria-label="Saved presets"
        >
          <option value="">Presets…</option>
          {#each presetChoices as preset (preset.name)}
            <option value={preset.name}>{preset.name}</option>
          {/each}
        </select>
        <button
          type="button"
          class="seq-button seq-button-secondary seq-button-sm"
          onclick={loadPreset}
          disabled={!selectedPreset}
        >
          Load
        </button>
        <form method="POST" action="?/deletePreset" use:enhance={presetDelete}>
          <input type="hidden" name="presetName" value={selectedPreset} />
          {#if confirmingPresetDelete}
            <button type="submit" class="seq-button seq-button-ghost seq-button-sm mg-preset-confirm">
              Confirm delete
            </button>
            <button
              type="button"
              class="seq-button seq-button-ghost seq-button-sm"
              onclick={() => (confirmingPresetDelete = false)}
            >
              Keep
            </button>
          {:else}
            <button
              type="button"
              class="seq-button seq-button-ghost seq-button-sm"
              onclick={() => (confirmingPresetDelete = true)}
              disabled={!selectedPreset}
            >
              Delete
            </button>
          {/if}
        </form>
        <form class="mg-preset-save" method="POST" action="?/savePreset" use:enhance={presetSubmit}>
          <input type="hidden" name="presetPayload" value={presetPayload} />
          <input
            class="mg-input"
            name="presetName"
            bind:value={newPresetName}
            placeholder="Preset name"
            maxlength="60"
          />
          <button
            type="submit"
            class="seq-button seq-button-secondary seq-button-sm"
            disabled={!newPresetName.trim()}
          >
            Save preset
          </button>
        </form>
      </div>
    </div>
    {#if presetError}
      <p class="mg-toolbar-error"><span class="mg-error" role="alert">{presetError}</span></p>
    {/if}

    <form method="POST" action="?/save" use:enhance={submit}>
      <input type="hidden" name="payload" value={payload} />
      <!-- The version the visible draft is based on (see knownUpdatedAt): own
           saves and rolls advance it so follow-up saves aren't rejected as
           stale, but a change this tab never displayed is. -->
      <input type="hidden" name="baseUpdatedAt" value={knownUpdatedAt ?? ""} />
      <input type="hidden" name="trackerPayload" value={trackerPayload} />

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Identity{/snippet}</SectionLabel>
        <div class="mg-grid-2">
          <label class="mg-field">
            <span class="mg-label">Name</span>
            <input class="mg-input" bind:value={name} oninput={syncSlug} maxlength="80" />
          </label>
          {#if mode === "create"}
            <label class="mg-field">
              <span class="mg-label">Slug</span>
              <input
                class="mg-input mg-mono"
                bind:value={slug}
                oninput={() => (slugEdited = true)}
                maxlength="64"
                spellcheck="false"
              />
            </label>
          {:else}
            <div class="mg-field">
              <span class="mg-label">Slug</span>
              <span class="mg-static">/events/{slug}</span>
            </div>
          {/if}
        </div>
        <label class="mg-field">
          <span class="mg-label">Tagline</span>
          <input class="mg-input" bind:value={tagline} maxlength="200" />
        </label>
        <div class="mg-grid-2">
          <label class="mg-field">
            <span class="mg-label">Access</span>
            <select class="mg-input" bind:value={access}>
              <option value="members">Members</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label class="mg-check">
            <input type="checkbox" bind:checked={published} />
            <span>
              Listed on the events hub
              <small>Unlisted drafts stay visible to managers.</small>
            </span>
          </label>
        </div>
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Schedule{/snippet}</SectionLabel>
        <div class="mg-grid-2">
          <label class="mg-field">
            <span class="mg-label">Starts (UTC)</span>
            <InstantField bind:value={startsAt} name="Start" />
          </label>
          <label class="mg-field">
            <span class="mg-label">Ends (UTC)</span>
            <InstantField bind:value={endsAt} name="End" />
          </label>
        </div>
        <p class="mg-hint">Leave both empty while dates are TBA.</p>
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Sky{/snippet}</SectionLabel>
        <div class="mg-grid-colors">
          <label class="mg-field">
            <span class="mg-label">Sky top</span>
            <span class="mg-color-pair">
              <input type="color" bind:value={skyTop} />
              <input class="mg-input mg-mono" bind:value={skyTop} maxlength="7" spellcheck="false" />
            </span>
          </label>
          <label class="mg-field">
            <span class="mg-label">Sky bottom</span>
            <span class="mg-color-pair">
              <input type="color" bind:value={skyBottom} />
              <input class="mg-input mg-mono" bind:value={skyBottom} maxlength="7" spellcheck="false" />
            </span>
          </label>
          <label class="mg-field">
            <span class="mg-label">Accent</span>
            <span class="mg-color-pair">
              <input type="color" bind:value={accent} />
              <input class="mg-input mg-mono" bind:value={accent} maxlength="7" spellcheck="false" />
            </span>
          </label>
          <label class="mg-field">
            <span class="mg-label">Accent 2</span>
            <span class="mg-color-pair">
              <input type="color" bind:value={accentSecondary} />
              <input class="mg-input mg-mono" bind:value={accentSecondary} maxlength="7" spellcheck="false" />
            </span>
          </label>
          <label class="mg-field">
            <span class="mg-label">Stars</span>
            <span class="mg-color-pair">
              <input type="color" bind:value={star} />
              <input class="mg-input mg-mono" bind:value={star} maxlength="7" spellcheck="false" />
            </span>
          </label>
        </div>
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Icon{/snippet}</SectionLabel>
        <div class="mg-icon-grid" role="group" aria-label="Event icon">
          <button
            type="button"
            class="mg-icon-option focus-ring"
            class:mg-icon-option-selected={iconFile === ""}
            aria-pressed={iconFile === ""}
            onclick={() => (iconFile = "")}
          >
            <span class="mg-icon-none" aria-hidden="true">✕</span>
            <span class="mg-icon-label">None</span>
          </button>
          {#each RAID_ICONS as icon (icon.file)}
            <button
              type="button"
              class="mg-icon-option focus-ring"
              class:mg-icon-option-selected={iconFile === icon.file}
              aria-pressed={iconFile === icon.file}
              onclick={() => (iconFile = icon.file)}
            >
              <img src={raidIconUrl(icon.file)} alt="" loading="lazy" />
              <span class="mg-icon-label">{icon.label}</span>
            </button>
          {/each}
        </div>
        {#if iconFile}
          <div class="mg-field">
            <span class="mg-label">Shown on</span>
            <div class="mg-icon-placements">
              <label class="mg-check">
                <input type="checkbox" value="hero" bind:group={iconPlacements} />
                <span>
                  Hero
                  <small>Event page, above the name.</small>
                </span>
              </label>
              <label class="mg-check">
                <input type="checkbox" value="band" bind:group={iconPlacements} />
                <span>
                  Band
                  <small>Marks the event's row on the hub.</small>
                </span>
              </label>
              <label class="mg-check">
                <input type="checkbox" value="meta" bind:group={iconPlacements} />
                <span>
                  Meta
                  <small>Next to the status line.</small>
                </span>
              </label>
              <label class="mg-check">
                <input type="checkbox" value="manage" bind:group={iconPlacements} />
                <span>
                  Manage
                  <small>Marks the event's row in the manage list.</small>
                </span>
              </label>
            </div>
          </div>
        {/if}
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}About{/snippet}</SectionLabel>
        <label class="mg-field">
          <span class="mg-label">Hero lead</span>
          <textarea class="mg-input mg-textarea" rows="4" bind:value={about}></textarea>
        </label>
        <p class="mg-hint">Blank line between paragraphs.</p>
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Goals{/snippet}</SectionLabel>
        <label class="mg-check">
          <input
            type="checkbox"
            bind:checked={goalEnabled}
            onchange={(event) => {
              // The explicit handler can run before bind:checked applies -
              // read the DOM state, not the bound one.
              if (event.currentTarget.checked && goals.length === 0) goals.push(newGoalRow());
            }}
          />
          <span>Track goals</span>
        </label>
        {#if goalEnabled}
          {#each goals as goal, goalIndex (goal.id)}
            <div class="mg-goal">
              <div class="mg-goal-head">
                <span class="mg-label">Goal {goalIndex + 1}</span>
                <button
                  type="button"
                  class="mg-remove focus-ring"
                  onclick={() => (goals = goals.filter((entry) => entry.id !== goal.id))}
                  aria-label="Remove goal {goalIndex + 1}"
                >✕</button>
              </div>
              <label class="mg-field">
                <span class="mg-label">Metric</span>
                <input class="mg-input" bind:value={goal.metric} placeholder="guild raids" maxlength="80" />
              </label>
              <div class="mg-field">
                <span class="mg-label">Milestones</span>
                {#each goal.milestones as milestone (milestone.id)}
                  <div class="mg-repeat-row mg-repeat-milestone">
                    <input
                      class="mg-input"
                      type="number"
                      min="1"
                      placeholder="Target"
                      bind:value={milestone.at}
                      aria-label="Milestone target"
                    />
                    <input
                      class="mg-input"
                      placeholder="Unlocks, e.g. Rank Up Raffle"
                      bind:value={milestone.unlock}
                      maxlength="120"
                      aria-label="Milestone unlock"
                    />
                    <button
                      type="button"
                      class="mg-remove focus-ring"
                      onclick={() =>
                        (goal.milestones = goal.milestones.filter((entry) => entry.id !== milestone.id))}
                      aria-label="Remove milestone"
                    >✕</button>
                  </div>
                {/each}
                <button type="button" class="mg-add focus-ring" onclick={() => goal.milestones.push(newMilestoneRow())}>
                  + Add milestone
                </button>
                <p class="mg-hint">Targets must ascend - the last one is the headline target.</p>
              </div>
              <div class="mg-field">
                <span class="mg-label">Data source</span>
                <div class="mg-choices" role="radiogroup" aria-label="Goal {goalIndex + 1} data source">
                  <label class="mg-choice" class:mg-choice-selected={goal.source === "raids"}>
                    <input class="mg-choice-input" type="radio" name="goal-source-{goal.id}" value="raids" bind:group={goal.source} />
                    <span class="mg-choice-title">Guild raid feed</span>
                    <span class="mg-choice-desc">Member participation credits from the activity feed - party size inflates them.</span>
                  </label>
                  <label class="mg-choice" class:mg-choice-selected={goal.source === "raidRuns"}>
                    <input class="mg-choice-input" type="radio" name="goal-source-{goal.id}" value="raidRuns" bind:group={goal.source} />
                    <span class="mg-choice-title">Mod completions</span>
                    <span class="mg-choice-desc">Counts unique runs from the guild mod - one per party, misses runs without a mod user.</span>
                  </label>
                  <label class="mg-choice" class:mg-choice-selected={goal.source === "wars"}>
                    <input class="mg-choice-input" type="radio" name="goal-source-{goal.id}" value="wars" bind:group={goal.source} />
                    <span class="mg-choice-title">War feed</span>
                    <span class="mg-choice-desc">Sums wars from the daily stat rollups - whole UTC days.</span>
                  </label>
                  <label class="mg-choice" class:mg-choice-selected={goal.source === "playtime"}>
                    <input class="mg-choice-input" type="radio" name="goal-source-{goal.id}" value="playtime" bind:group={goal.source} />
                    <span class="mg-choice-title">Playtime feed</span>
                    <span class="mg-choice-desc">Sums hours played from the daily stat rollups - whole UTC days.</span>
                  </label>
                  <label class="mg-choice" class:mg-choice-selected={goal.source === "manual"}>
                    <input class="mg-choice-input" type="radio" name="goal-source-{goal.id}" value="manual" bind:group={goal.source} />
                    <span class="mg-choice-title">Manual</span>
                    <span class="mg-choice-desc">No live wiring - the meter shows the total entered below.</span>
                  </label>
                </div>
              </div>
              <div class="mg-grid-2">
                {#if goal.source === "raids" || goal.source === "raidRuns"}
                  <label class="mg-field">
                    <span class="mg-label">Which raids count</span>
                    <select class="mg-input" bind:value={goal.raid}>
                      <option value="">All guild raids</option>
                      {#each raidOptionsFor(goal.raid) as raid (raid)}
                        <option value={raid}>{raid}</option>
                      {/each}
                    </select>
                  </label>
                {/if}
                <label class="mg-field">
                  <span class="mg-label">{goal.source === "manual" ? "Total so far" : "Final total"}</span>
                  <input class="mg-input" type="number" min="0" bind:value={goal.finalTotal} />
                </label>
              </div>
              <p class="mg-hint">
                {goal.source === "manual"
                  ? "Update the total by hand as the event progresses."
                  : "Final total is optional - set it once the event has ended to freeze the meter."}
              </p>
            </div>
          {/each}
          <button type="button" class="mg-add focus-ring" onclick={() => goals.push(newGoalRow())}>
            + Add goal
          </button>
        {/if}
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Personal milestones{/snippet}</SectionLabel>
        <p class="mg-hint">
          Per-member raid targets on the standings board - each member sees their own progress on
          the event page, and a raffle below can require one to enter. Needs a tracker (set under
          Standings) to count raids.
        </p>
        {#each personalMilestones as milestone (milestone.key)}
          <div class="mg-repeat-row mg-repeat-milestone">
            <input
              class="mg-input"
              type="number"
              min="1"
              placeholder="Raids"
              bind:value={milestone.at}
              aria-label="Personal milestone target"
            />
            <input
              class="mg-input"
              placeholder="Unlocks, e.g. Rank Up eligibility"
              bind:value={milestone.unlock}
              maxlength="120"
              aria-label="Personal milestone unlock"
            />
            <button
              type="button"
              class="mg-remove focus-ring"
              onclick={() =>
                (personalMilestones = personalMilestones.filter((entry) => entry.key !== milestone.key))}
              aria-label="Remove personal milestone"
            >✕</button>
          </div>
        {/each}
        <button
          type="button"
          class="mg-add focus-ring"
          onclick={() => personalMilestones.push(newPersonalMilestoneRow())}
        >
          + Add personal milestone
        </button>
        {#if personalMilestones.length > 1}
          <p class="mg-hint">Targets must ascend.</p>
        {/if}
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Activity chart{/snippet}</SectionLabel>
        <div class="mg-grid-2">
          <label class="mg-field">
            <span class="mg-label">Daily bars show</span>
            <select class="mg-input" bind:value={chartSource}>
              <option value="goal">Match the goal</option>
              <option value="raids">Raid feed - member credits</option>
              <option value="raidRuns">Mod completions - unique runs</option>
              <option value="off">Hidden</option>
            </select>
          </label>
          {#if chartSource === "raids" || chartSource === "raidRuns"}
            <label class="mg-field">
              <span class="mg-label">Which raids</span>
              <select class="mg-input" bind:value={chartRaid}>
                <option value="">All guild raids</option>
                {#each chartRaidOptions as raid (raid)}
                  <option value={raid}>{raid}</option>
                {/each}
              </select>
            </label>
          {/if}
        </div>
        <p class="mg-hint">
          Wars and playtime have no daily feed - those goals show no chart unless a raid source
          is chosen here.
        </p>
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Prizes{/snippet}</SectionLabel>
        {#each prizes as prize (prize.id)}
          <div class="mg-repeat-row mg-repeat-prize">
            <input class="mg-input" placeholder="Donor" bind:value={prize.donor} maxlength="80" />
            <input
              class="mg-input"
              placeholder="Player (links the donor)"
              bind:value={prize.donorPlayer}
              list="mg-member-list"
              maxlength="25"
              spellcheck="false"
              aria-label="Donor's Minecraft player"
            />
            <input class="mg-input" placeholder="Prize" bind:value={prize.prize} maxlength="300" />
            <button
              type="button"
              class="mg-remove focus-ring"
              onclick={() => (prizes = prizes.filter((entry) => entry.id !== prize.id))}
              aria-label="Remove prize"
            >✕</button>
          </div>
        {/each}
        <button
          type="button"
          class="mg-add focus-ring"
          onclick={() => prizes.push({ donor: "", prize: "", donorPlayer: "", id: nextRowId++ })}
        >
          + Add prize
        </button>
        {#if prizes.length > 0}
          <p class="mg-hint">Naming a player turns the donor into a link to their playercard.</p>
        {/if}
        {#if prizes.length > 0}
          <label class="mg-field">
            <span class="mg-label">Note</span>
            <input class="mg-input" bind:value={prizesNote} maxlength="500" />
          </label>
        {/if}
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Suggested comp{/snippet}</SectionLabel>
        {#each compRoles as role (role.id)}
          <div class="mg-repeat-row mg-repeat-comp">
            <input class="mg-input" placeholder="Role" bind:value={role.role} maxlength="60" />
            <input class="mg-input" placeholder="Builds" bind:value={role.builds} maxlength="200" />
            <input class="mg-input" placeholder="Note" bind:value={role.note} maxlength="200" />
            <button
              type="button"
              class="mg-remove focus-ring"
              onclick={() => (compRoles = compRoles.filter((entry) => entry.id !== role.id))}
              aria-label="Remove role"
            >✕</button>
          </div>
        {/each}
        <button
          type="button"
          class="mg-add focus-ring"
          onclick={() => compRoles.push({ role: "", builds: "", note: "", id: nextRowId++ })}
        >
          + Add role
        </button>
        {#if compRoles.length > 0}
          <label class="mg-field">
            <span class="mg-label">Comp note</span>
            <input class="mg-input" bind:value={compNote} maxlength="300" />
          </label>
        {/if}
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Rules{/snippet}</SectionLabel>
        <label class="mg-field">
          <span class="mg-label">One rule per line</span>
          <textarea class="mg-input mg-textarea" rows="4" bind:value={rules}></textarea>
        </label>
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Standings{/snippet}</SectionLabel>
        <label class="mg-check">
          <input type="checkbox" bind:checked={trackerEnabled} />
          <span>
            Show a standings board
            <small>Per-member contributions from a raid tracker event.</small>
          </span>
        </label>
        {#if trackerEnabled}
          {#if !trackerManual}
            <label class="mg-field">
              <span class="mg-label">Tracker event</span>
              <select
                class="mg-input"
                bind:value={trackerEventId}
                onchange={(event) => syncTracking(event.currentTarget.value)}
              >
                <option value="" disabled>Pick a tracker event</option>
                {#each trackerChoices as option (option.id)}
                  <option value={option.id}>
                    {option.name} ({option.window}{option.raid ? ` - ${option.raid}` : ""})
                  </option>
                {/each}
              </select>
            </label>
            <p class="mg-hint">
              {trackerEventId
                ? `Counts ${selectedTracker?.raid ?? "all guild raids"} via ${trackerTracking === "mod" ? "the guild mod" : "the Wynncraft API"}.`
                : "Standings show each member's contribution inside the tracker window."}
              {#if selectedTracker}
                <button type="button" class="mg-inline-link focus-ring" onclick={openTrackerEdit}>
                  Edit tracker
                </button>
              {/if}
              <button type="button" class="mg-inline-link focus-ring" onclick={() => (trackerManual = true)}>
                Enter an id manually
              </button>
            </p>
          {:else}
            <div class="mg-grid-2">
              <label class="mg-field">
                <span class="mg-label">Tracker event id</span>
                <input class="mg-input mg-mono" bind:value={trackerEventId} maxlength="64" spellcheck="false" />
              </label>
              <label class="mg-field">
                <span class="mg-label">Tracking source</span>
                <select class="mg-input" bind:value={trackerTracking}>
                  <option value="api">Wynncraft API</option>
                  <option value="mod">Guild mod</option>
                </select>
              </label>
            </div>
            {#if trackerChoices.length > 0}
              <p class="mg-hint">
                <button type="button" class="mg-inline-link focus-ring" onclick={leaveManualMode}>
                  Pick from the tracker events instead
                </button>
              </p>
            {/if}
          {/if}

          {#if trackerEditor !== "closed"}
            <div class="mg-tracker-new">
              <span class="mg-label">
                {trackerEditor === "edit" ? `Edit tracker: ${newTrackerName}` : "New tracker event"}
              </span>
              <div class="mg-grid-2">
                <label class="mg-field">
                  <span class="mg-label">Name</span>
                  <input class="mg-input" bind:value={newTrackerName} maxlength="80" />
                </label>
                <label class="mg-field">
                  <span class="mg-label">Tracking source</span>
                  <select class="mg-input" bind:value={newTrackerTracking}>
                    <option value="mod">Guild mod</option>
                    <option value="api">Wynncraft API</option>
                  </select>
                </label>
                <label class="mg-field">
                  <span class="mg-label">Starts (UTC)</span>
                  <InstantField bind:value={newTrackerStarts} name="Tracker start" />
                </label>
                <label class="mg-field">
                  <span class="mg-label">Ends (UTC)</span>
                  <InstantField bind:value={newTrackerEnds} name="Tracker end" />
                </label>
                {#if newTrackerTracking === "mod"}
                  <label class="mg-field">
                    <span class="mg-label">Which raids count</span>
                    <select class="mg-input" bind:value={newTrackerRaid}>
                      <option value="">All guild raids</option>
                      {#each KNOWN_RAIDS as raid (raid.key)}
                        <option value={raid.key}>{raid.key}</option>
                      {/each}
                    </select>
                  </label>
                {/if}
              </div>
              <p class="mg-hint">
                {newTrackerTracking === "mod"
                  ? "The guild mod attributes completions per raid, so mod trackers can scope to one raid."
                  : "API counter diffs count all guild raids together - no per-raid scoping."}
              </p>
              <div class="mg-tracker-new-actions">
                <button
                  type="submit"
                  formaction={trackerEditor === "edit" ? "?/updateTracker" : "?/createTracker"}
                  formnovalidate
                  class="seq-button seq-button-secondary seq-button-sm"
                  disabled={trackerBusy}
                >
                  {trackerEditor === "edit" ? "Save tracker" : "Create tracker"}
                </button>
                <button
                  type="button"
                  class="seq-button seq-button-ghost seq-button-sm"
                  onclick={() => (trackerEditor = "closed")}
                >
                  Cancel
                </button>
                {#if trackerAttempted && trackerDraftError}
                  <span class="mg-error" role="alert">{trackerDraftError}</span>
                {:else if trackerError}
                  <span class="mg-error" role="alert">{trackerError}</span>
                {/if}
              </div>
            </div>
          {:else}
            <p class="mg-hint">
              <button type="button" class="mg-inline-link mg-inline-link-solo focus-ring" onclick={openTrackerCreator}>
                + New tracker event
              </button>
            </p>
          {/if}
        {/if}
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Raffles{/snippet}</SectionLabel>
        <p class="mg-hint">
          Entrants earn one ticket per <em>raids / ticket</em> raids on the standings board,
          counted inside each raffle's window. Set up each raffle, save, then roll each winner
          below - re-rolling replaces that slot.
        </p>
        {#if raffles.length > 1}
          <label class="mg-check">
            <input type="checkbox" bind:checked={raffleExcludeWinners} />
            <span>
              Exclude winners from other raffles
              <small>A member who wins any raffle is dropped from every other draw here.</small>
            </span>
          </label>
        {/if}
        {#each raffles as raffle (raffle.key)}
          <div class="mg-raffle">
            <div class="mg-repeat-row mg-repeat-raffle">
              <input class="mg-input" placeholder="Prize" bind:value={raffle.prize} maxlength="300" />
              <label class="mg-field mg-field-tight">
                <span class="mg-label">Winners</span>
                <input class="mg-input" type="number" min="1" max={RAFFLE_MAX_WINNERS} bind:value={raffle.winnerCount} />
              </label>
              <label class="mg-field mg-field-tight">
                <span class="mg-label">Raids / ticket</span>
                <input class="mg-input" type="number" min="1" bind:value={raffle.perTicket} />
              </label>
              <button
                type="button"
                class="mg-remove focus-ring"
                onclick={() => (raffles = raffles.filter((entry) => entry.key !== raffle.key))}
                aria-label="Remove raffle"
              >✕</button>
            </div>
            <div class="mg-grid-2">
              <label class="mg-field">
                <span class="mg-label">Ticket window start (UTC)</span>
                <InstantField bind:value={raffle.windowFrom} name="Raffle window start" />
              </label>
              <label class="mg-field">
                <span class="mg-label">Ticket window end (UTC)</span>
                <InstantField bind:value={raffle.windowTo} name="Raffle window end" />
              </label>
            </div>
            {#if milestoneOptions.length > 0}
              <label class="mg-field">
                <span class="mg-label">Requires personal milestone</span>
                <select class="mg-input" bind:value={raffle.requiresMilestone}>
                  <option value="">No requirement</option>
                  {#each milestoneOptions as option (option.id)}
                    <option value={option.id}>{option.label}</option>
                  {/each}
                </select>
                <span class="mg-hint">
                  Only members who reached this milestone (full event standings) may enter.
                </span>
              </label>
            {/if}
          </div>
        {/each}
        <button
          type="button"
          class="mg-add focus-ring"
          onclick={() => raffles.push(newRaffleRow())}
        >
          + Add raffle
        </button>

        {#if raffleSlots.length > 0}
          <div class="mg-raffle-results" role="table" aria-label="Raffle winners">
            <div class="mg-raffle-result mg-raffle-result-head" role="row">
              <span role="columnheader">Winner</span>
              <span role="columnheader">Prize</span>
              <span role="columnheader" class="mg-raffle-roll-head">Roll</span>
            </div>
            {#each raffleSlots as row (row.key)}
              <div class="mg-raffle-result" role="row">
                <span
                  class="mg-raffle-cell mg-raffle-winner-cell"
                  class:mg-raffle-unrolled={!row.winner}
                  role="cell"
                >{row.winner ? row.winner.username : "Not rolled"}</span>
                <span class="mg-raffle-cell mg-raffle-prize-cell" role="cell">{row.prize || "—"}</span>
                <span class="mg-raffle-roll-cell" role="cell">
                  {#if row.saved}
                    <button
                      type="submit"
                      formaction="?/rollRaffle"
                      formnovalidate
                      name="rollTarget"
                      value={`${row.raffleId}:${row.slot}`}
                      class="mg-roll-btn focus-ring"
                      disabled={rollingId !== null}
                      aria-label={row.winner ? "Re-roll this winner" : "Roll this winner"}
                      title={row.winner ? "Re-roll" : "Roll"}
                    >↺</button>
                  {:else}
                    <span class="mg-raffle-savefirst">Save first</span>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
        {#if rollError}
          <span class="mg-error" role="alert">{rollError}</span>
        {/if}
      </section>

      <div class="mg-footer">
        <button type="submit" class="seq-button seq-button-primary seq-button-md" disabled={saving}>
          {mode === "create" ? "Create event" : "Save changes"}
        </button>
        {#if mode === "edit"}
          <a class="mg-view focus-ring" href={`/events/${slug}`}>View page</a>
        {/if}
        {#if showValidation && liveError}
          <span class="mg-error" role="alert">{liveError}</span>
        {:else if error}
          <span class="mg-error" role="alert">{error}</span>
        {:else if saved}
          <span class="mg-saved">Saved</span>
        {/if}
        {#if auditWarning}
          <span class="mg-error" role="alert">Done, but not recorded in the audit log.</span>
        {/if}
      </div>
    </form>

    {#if memberChoices.length > 0}
      <datalist id="mg-member-list">
        {#each memberChoices as member (member)}
          <option value={member}></option>
        {/each}
      </datalist>
    {/if}

    {#if mode === "edit"}
      <form class="mg-danger" method="POST" action="?/delete" use:enhance>
        <!-- Same draft-pinned version token as the save form: deleting is only
             safe against the version the manager actually reviewed. -->
        <input type="hidden" name="baseUpdatedAt" value={knownUpdatedAt ?? ""} />
        {#if confirmingDelete}
          <span class="mg-error">This permanently removes the event.</span>
          <button type="submit" class="mg-delete focus-ring">Confirm delete</button>
          <button
            type="button"
            class="seq-button seq-button-ghost seq-button-sm"
            onclick={() => (confirmingDelete = false)}
          >
            Keep
          </button>
        {:else}
          <button
            type="button"
            class="seq-button seq-button-ghost seq-button-sm"
            onclick={() => (confirmingDelete = true)}
          >
            Delete event
          </button>
        {/if}
      </form>
    {/if}
  </div>

  <aside class="mg-side" aria-label="Live preview">
    <SectionLabel>{#snippet children()}Preview{/snippet}</SectionLabel>
    <EventSky {theme}>
      <div class="mg-preview">
        {#if iconFile && iconPlacements.includes("hero")}
          <img class="mg-preview-icon" src={raidIconUrl(iconFile)} alt="" />
        {:else}
          <span class="mg-preview-spark" style="color: {accent}" aria-hidden="true">✦</span>
        {/if}
        <span
          class="mg-preview-name"
          style="background-image: linear-gradient(90deg, {accent}, {accentSecondary})"
        >
          {name || "Event name"}
        </span>
        <span class="mg-preview-tagline">{tagline || "Tagline."}</span>
        {#if previewGoals[0]}
          <div class="mg-preview-goal">
            <GoalMeter goal={previewGoals[0]} current={null} size="band" />
          </div>
        {/if}
      </div>
    </EventSky>
    <p class="mg-hint">How the hub band and page hero pick up the sky.</p>

    {#if previewGoals.length > 0}
      <div class="mg-goal-preview" style="--ev-accent: {accent}; --ev-accent-2: {accentSecondary}">
        <SectionLabel>{#snippet children()}Goal preview{/snippet}</SectionLabel>
        {#each previewGoals as goal, index (index)}
          {@const finalAt = goal.milestones.at(-1)?.at ?? 1}
          {@const percent = goals[index]?.previewPercent ?? 60}
          <div class="mg-goal-preview-item">
            <GoalMeter {goal} current={Math.round((finalAt * percent) / 100)} />
            {#if goals[index]}
              <label class="mg-goal-preview-slider">
                <span class="mg-label">Preview progress</span>
                <input type="range" min="0" max="120" step="1" bind:value={goals[index].previewPercent} />
              </label>
            {/if}
          </div>
        {/each}
        <p class="mg-hint">Drag to see the meter at any point of the event.</p>
      </div>
    {/if}
  </aside>
</div>

<style>
  .mg-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 40px;
    align-items: start;
  }

  .mg-side {
    position: sticky;
    top: calc(3.5rem + 20px);
  }

  .mg-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .mg-history {
    display: flex;
    gap: 6px;
  }

  .mg-presets {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .mg-presets form {
    display: flex;
    gap: 8px;
  }

  .mg-preset-select {
    width: 170px;
  }

  .mg-preset-save .mg-input {
    width: 160px;
  }

  .mg-preset-confirm {
    color: var(--status-error);
  }

  .mg-toolbar-error {
    margin: 10px 0 0;
  }

  .mg-section {
    display: grid;
    gap: 14px;
    padding: 22px 0 26px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .mg-section:first-child {
    padding-top: 0;
  }

  .mg-grid-2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .mg-grid-colors {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 14px;
  }

  .mg-field {
    display: grid;
    gap: 6px;
    align-content: start;
  }

  .mg-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .mg-input {
    width: 100%;
    padding: 9px 11px;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-abyss) 65%, transparent);
    color: var(--text-body);
    font-family: var(--font-data);
    font-size: var(--text-sm);
    transition: border-color var(--dur-fast) ease;
  }

  .mg-input:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, var(--color-gold) 55%, var(--color-border-subtle));
  }

  .mg-input::placeholder {
    color: var(--text-muted);
    opacity: 0.6;
  }

  select.mg-input {
    appearance: none;
    cursor: pointer;
  }

  .mg-textarea {
    resize: vertical;
    line-height: var(--leading-normal);
  }

  .mg-mono {
    font-variant-numeric: tabular-nums;
  }

  .mg-static {
    padding: 9px 0;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-sm);
  }

  .mg-check {
    display: flex;
    gap: 10px;
    align-items: baseline;
    color: var(--text-body);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .mg-check input {
    accent-color: var(--color-gold);
    translate: 0 1px;
  }

  .mg-check small {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .mg-hint {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .mg-color-pair {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 8px;
    align-items: stretch;
  }

  .mg-color-pair input[type="color"] {
    width: 38px;
    height: 100%;
    min-height: 38px;
    padding: 3px;
    border: 1px solid var(--color-border-subtle);
    background: transparent;
    cursor: pointer;
  }

  .mg-repeat-row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) auto;
    gap: 10px;
    align-items: center;
  }

  .mg-repeat-comp {
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) minmax(0, 2fr) auto;
  }

  .mg-repeat-prize {
    grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) minmax(0, 3fr) auto;
  }

  .mg-repeat-milestone {
    grid-template-columns: minmax(0, 1fr) minmax(0, 3fr) auto;
    margin-bottom: 8px;
  }

  .mg-repeat-raffle {
    grid-template-columns: minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1fr) auto;
    align-items: end;
  }

  .mg-field-tight {
    gap: 4px;
  }

  .mg-raffle {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--color-border-subtle);
    margin-bottom: 10px;
  }

  .mg-raffle-results {
    display: grid;
    gap: 8px;
    margin-top: 22px;
  }

  .mg-raffle-result {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) 44px;
    gap: 10px;
    align-items: center;
  }

  .mg-raffle-result-head {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .mg-raffle-roll-head {
    text-align: center;
  }

  .mg-raffle-cell {
    padding: 10px 12px;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-abyss) 45%, transparent);
    color: var(--text-body);
    font-family: var(--font-data);
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mg-raffle-unrolled {
    color: var(--text-muted);
    font-style: italic;
  }

  .mg-raffle-roll-cell {
    display: flex;
    justify-content: center;
  }

  .mg-roll-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid color-mix(in srgb, var(--color-gold) 45%, var(--color-border-subtle));
    background: transparent;
    color: var(--color-gold);
    font-size: 1.05rem;
    line-height: 1;
    cursor: pointer;
    transition:
      border-color var(--dur-fast) ease,
      background var(--dur-fast) ease,
      transform var(--dur-fast) ease;
  }

  .mg-roll-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-gold) 12%, transparent);
    transform: rotate(-45deg);
  }

  .mg-roll-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .mg-raffle-savefirst {
    color: var(--text-muted);
    font-size: var(--text-2xs);
    text-align: center;
  }

  .mg-goal {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--color-border-subtle);
  }

  .mg-goal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .mg-goal-preview {
    display: grid;
    gap: 18px;
    margin-top: 24px;
    padding: 18px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(19, 22, 31, 0.5);
  }

  .mg-goal-preview-item {
    display: grid;
    gap: 12px;
  }

  .mg-goal-preview-slider {
    display: grid;
    gap: 6px;
  }

  .mg-goal-preview-slider input[type="range"] {
    width: 100%;
    accent-color: var(--ev-accent, var(--color-gold));
  }

  .mg-icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
    gap: 10px;
  }

  .mg-icon-option {
    display: grid;
    justify-items: center;
    gap: 8px;
    min-width: 0;
    padding: 12px 6px 10px;
    border: 1px solid var(--color-border-subtle);
    background: none;
    cursor: pointer;
    transition: border-color var(--dur-fast) ease;
  }

  .mg-icon-option:hover {
    border-color: var(--color-border-accent);
  }

  .mg-icon-option-selected,
  .mg-icon-option-selected:hover {
    border-color: color-mix(in srgb, var(--color-gold) 55%, var(--color-border-subtle));
  }

  .mg-icon-option img {
    width: 36px;
    height: 36px;
    image-rendering: pixelated;
  }

  .mg-icon-none {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .mg-icon-label {
    max-width: 100%;
    overflow-wrap: anywhere;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-align: center;
    text-transform: uppercase;
  }

  .mg-icon-option-selected .mg-icon-label {
    color: var(--color-gold);
  }

  .mg-icon-placements {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 28px;
  }

  .mg-choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .mg-choice {
    position: relative;
    display: grid;
    gap: 4px;
    padding: 12px 14px;
    border: 1px solid var(--color-border-subtle);
    cursor: pointer;
    transition: border-color var(--dur-fast) ease;
  }

  .mg-choice:hover {
    border-color: var(--color-border-accent);
  }

  .mg-choice-selected,
  .mg-choice-selected:hover {
    border-color: color-mix(in srgb, var(--color-gold) 55%, var(--color-border-subtle));
  }

  .mg-choice-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .mg-choice:has(.mg-choice-input:focus-visible) {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .mg-choice-title {
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .mg-choice-selected .mg-choice-title {
    color: var(--color-gold);
  }

  .mg-choice-desc {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .mg-tracker-new {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--color-border-subtle);
  }

  .mg-tracker-new-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .mg-inline-link-solo {
    margin-left: 0;
  }

  .mg-inline-link {
    margin-left: 6px;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
  }

  .mg-remove {
    padding: 8px 10px;
    border: 1px solid var(--color-border-subtle);
    background: none;
    color: var(--text-muted);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease;
  }

  .mg-remove:hover {
    border-color: var(--color-border-accent);
    color: var(--text-body);
  }

  .mg-add {
    justify-self: start;
    padding: 6px 2px;
    border: none;
    background: none;
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
  }

  .mg-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    padding-top: 26px;
  }

  .mg-view {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-decoration: none;
    text-transform: uppercase;
    transition: color var(--dur-fast) ease;
  }

  .mg-view:hover {
    color: var(--color-gold);
  }

  .mg-error {
    color: #e05252;
    font-size: var(--text-sm);
  }

  .mg-saved {
    color: var(--color-gold);
    font-size: var(--text-sm);
  }

  .mg-danger {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-top: 44px;
    padding-top: 18px;
    border-top: 1px solid var(--color-border-subtle);
  }

  .mg-delete {
    padding: 8px 16px;
    border: 1px solid color-mix(in srgb, #e05252 55%, transparent);
    background: none;
    color: #e05252;
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
  }

  .mg-preview {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 34px 22px;
    text-align: center;
  }

  .mg-preview-spark {
    font-size: var(--text-sm);
  }

  .mg-preview-icon {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
  }

  .mg-preview-name {
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }

  .mg-preview-tagline {
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .mg-preview-goal {
    width: min(280px, 100%);
    margin-top: 10px;
  }

  @media (max-width: 1000px) {
    .mg-editor {
      grid-template-columns: minmax(0, 1fr);
    }

    .mg-side {
      position: static;
      order: -1;
    }
  }

  @media (max-width: 640px) {
    .mg-grid-2,
    .mg-repeat-row,
    .mg-repeat-comp,
    .mg-repeat-prize,
    .mg-choices {
      grid-template-columns: minmax(0, 1fr);
    }

    .mg-remove {
      justify-self: start;
    }
  }
</style>
