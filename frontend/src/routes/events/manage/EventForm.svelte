<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";

  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import EventSky from "$lib/events/components/EventSky.svelte";
  import GoalMeter from "$lib/events/components/GoalMeter.svelte";
  import type { CompRole, EventTheme, GuildEvent, PrizeEntry } from "$lib/events/types";
  import { parseGuildEvent } from "$lib/events/validate";
  import type { EventFormContext, TrackerOption } from "$lib/server/eventFormContext";
  import { KNOWN_RAIDS } from "$lib/site/raids";

  let {
    mode,
    initial = null,
    initialPublished = false,
    context = null,
    error = null,
    saved = false,
    trackerCreated = null,
    trackerUpdated = null,
    trackerError = null,
  }: {
    mode: "create" | "edit";
    initial?: GuildEvent | null;
    initialPublished?: boolean;
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
  } = $props();

  // The form deliberately seeds from the props once - the parent remounts it
  // via {#key} when the event changes.
  // svelte-ignore state_referenced_locally
  const seed = initial;
  // svelte-ignore state_referenced_locally
  const seedPublished = initialPublished;
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
  const seedStartsAt = seed?.startsAt ?? "";
  const seedEndsAt = seed?.endsAt ?? "";
  let startsAt = $state(toInput(seed?.startsAt));
  let endsAt = $state(toInput(seed?.endsAt));

  let skyTop = $state(seed?.theme.sky[0] ?? "#171120");
  let skyBottom = $state(seed?.theme.sky[1] ?? "#251b38");
  let accent = $state(seed?.theme.accent ?? "#a78bfa");
  let accentSecondary = $state(seed?.theme.accentSecondary ?? "#8fb2f0");
  let star = $state(seed?.theme.star ?? "#c4b5fd");

  let about = $state(seed?.about?.join("\n\n") ?? "");
  let goalEnabled = $state(seed?.goal !== undefined);
  let goalMetric = $state(seed?.goal?.metricLabel ?? "");
  // Number inputs bind numbers (or null when cleared), not strings.
  let goalTarget = $state<string | number | null | undefined>(seed?.goal ? seed.goal.target : "");
  let goalUnlock = $state(seed?.goal?.unlock ?? "");
  let goalSource = $state<"manual" | "raids" | "wars" | "playtime">(seed?.goal?.feed ?? "manual");
  let goalRaid = $state(seed?.goal?.countRaid ?? "");
  // Chart choice: "goal" follows the goal, "all"/"raid:<name>" chart raids
  // explicitly, "off" hides the chart.
  let chartChoice = $state(
    seed?.activity
      ? seed.activity.source === "none"
        ? "off"
        : seed.activity.countRaid
          ? `raid:${seed.activity.countRaid}`
          : "all"
      : "goal",
  );
  let goalFinalTotal = $state<string | number | null | undefined>(seed?.goal?.finalTotal ?? "");
  // Repeater rows carry a locally generated id so the each blocks are keyed -
  // unkeyed lists with two-way bindings corrupt state when middle rows are
  // removed.
  let nextRowId = 0;
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
    const paragraphs = splitParagraphs(about);
    if (paragraphs.length > 0) event.about = paragraphs;
    if (goalEnabled) {
      const goal: Record<string, unknown> = {
        metricLabel: goalMetric,
        target: toCount(goalTarget),
        unlock: goalUnlock,
      };
      if (goalSource !== "manual") {
        goal.feed = goalSource;
        if (goalSource === "raids" && goalRaid) goal.countRaid = goalRaid;
      }
      if (hasCount(goalFinalTotal)) goal.finalTotal = toCount(goalFinalTotal);
      event.goal = goal;
    }
    if (chartChoice === "all") event.activity = { source: "raids" };
    else if (chartChoice === "off") event.activity = { source: "none" };
    else if (chartChoice.startsWith("raid:")) {
      event.activity = { source: "raids", countRaid: chartChoice.slice(5) };
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
    return event;
  });

  const raidOptions = $derived.by(() => {
    const names = KNOWN_RAIDS.map((raid) => raid.key);
    return goalRaid && !names.includes(goalRaid) ? [...names, goalRaid] : names;
  });

  const chartRaidOptions = $derived.by(() => {
    const names = KNOWN_RAIDS.map((raid) => raid.key);
    const stored = chartChoice.startsWith("raid:") ? chartChoice.slice(5) : "";
    return stored && !names.includes(stored) ? [...names, stored] : names;
  });

  const parsed = $derived(parseGuildEvent(draftEvent));
  const liveError = $derived(parsed.ok ? null : parsed.error);
  const payload = $derived(JSON.stringify({ event: draftEvent, published }));
  const previewGoal = $derived(parsed.ok ? parsed.event.goal : undefined);

  const selectedTracker = $derived(
    trackerChoices.find((option) => option.id === trackerEventId) ?? null,
  );

  const trackerDraftError = $derived.by(() => {
    if (!newTrackerName.trim()) return "the tracker needs a name";
    if (!newTrackerStarts || !newTrackerEnds) return "the tracker needs a start and an end";
    if (Date.parse(toInstant(newTrackerStarts)) >= Date.parse(toInstant(newTrackerEnds))) {
      return "the tracker must end after it starts";
    }
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

  const submit: SubmitFunction = ({ action, cancel }) => {
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
    showValidation = true;
    if (liveError) {
      cancel();
      return;
    }
    saving = true;
    return async ({ update }) => {
      saving = false;
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
</script>

<div class="mg-editor">
  <div class="mg-main">
    <form method="POST" action="?/save" use:enhance={submit}>
      <input type="hidden" name="payload" value={payload} />
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
            <input class="mg-input" type="datetime-local" bind:value={startsAt} />
          </label>
          <label class="mg-field">
            <span class="mg-label">Ends (UTC)</span>
            <input class="mg-input" type="datetime-local" bind:value={endsAt} />
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
        <SectionLabel>{#snippet children()}About{/snippet}</SectionLabel>
        <label class="mg-field">
          <span class="mg-label">Hero lead</span>
          <textarea class="mg-input mg-textarea" rows="4" bind:value={about}></textarea>
        </label>
        <p class="mg-hint">Blank line between paragraphs.</p>
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Goal{/snippet}</SectionLabel>
        <label class="mg-check">
          <input type="checkbox" bind:checked={goalEnabled} />
          <span>Track a goal</span>
        </label>
        {#if goalEnabled}
          <div class="mg-grid-2">
            <label class="mg-field">
              <span class="mg-label">Metric</span>
              <input class="mg-input" bind:value={goalMetric} placeholder="guild raids" maxlength="80" />
            </label>
            <label class="mg-field">
              <span class="mg-label">Target</span>
              <input class="mg-input" type="number" min="1" bind:value={goalTarget} />
            </label>
          </div>
          <label class="mg-field">
            <span class="mg-label">Unlocks</span>
            <input class="mg-input" bind:value={goalUnlock} placeholder="Rank Up Raffle" maxlength="120" />
          </label>
          <div class="mg-field">
            <span class="mg-label">Data source</span>
            <div class="mg-choices" role="radiogroup" aria-label="Goal data source">
              <label class="mg-choice" class:mg-choice-selected={goalSource === "raids"}>
                <input class="mg-choice-input" type="radio" name="goal-source" value="raids" bind:group={goalSource} />
                <span class="mg-choice-title">Guild raid feed</span>
                <span class="mg-choice-desc">Counts raids live from the public guild activity feed.</span>
              </label>
              <label class="mg-choice" class:mg-choice-selected={goalSource === "wars"}>
                <input class="mg-choice-input" type="radio" name="goal-source" value="wars" bind:group={goalSource} />
                <span class="mg-choice-title">War feed</span>
                <span class="mg-choice-desc">Sums wars from the daily stat rollups.</span>
              </label>
              <label class="mg-choice" class:mg-choice-selected={goalSource === "playtime"}>
                <input class="mg-choice-input" type="radio" name="goal-source" value="playtime" bind:group={goalSource} />
                <span class="mg-choice-title">Playtime feed</span>
                <span class="mg-choice-desc">Sums hours played from the daily stat rollups.</span>
              </label>
              <label class="mg-choice" class:mg-choice-selected={goalSource === "manual"}>
                <input class="mg-choice-input" type="radio" name="goal-source" value="manual" bind:group={goalSource} />
                <span class="mg-choice-title">Manual</span>
                <span class="mg-choice-desc">No live wiring - the meter shows the total entered below.</span>
              </label>
            </div>
          </div>
          <div class="mg-grid-2">
            {#if goalSource === "raids"}
              <label class="mg-field">
                <span class="mg-label">Which raids count</span>
                <select class="mg-input" bind:value={goalRaid}>
                  <option value="">All guild raids</option>
                  {#each raidOptions as raid (raid)}
                    <option value={raid}>{raid}</option>
                  {/each}
                </select>
              </label>
            {/if}
            <label class="mg-field">
              <span class="mg-label">{goalSource === "manual" ? "Total so far" : "Final total"}</span>
              <input class="mg-input" type="number" min="0" bind:value={goalFinalTotal} />
            </label>
          </div>
          <p class="mg-hint">
            {goalSource === "manual"
              ? "Update the total by hand as the event progresses."
              : "Final total is optional - set it once the event has ended to freeze the meter."}
          </p>
        {/if}
      </section>

      <section class="mg-section">
        <SectionLabel>{#snippet children()}Activity chart{/snippet}</SectionLabel>
        <div class="mg-grid-2">
          <label class="mg-field">
            <span class="mg-label">Daily bars show</span>
            <select class="mg-input" bind:value={chartChoice}>
              <option value="goal">Match the goal</option>
              <option value="all">All guild raids</option>
              {#each chartRaidOptions as raid (raid)}
                <option value={`raid:${raid}`}>{raid}</option>
              {/each}
              <option value="off">Hidden</option>
            </select>
          </label>
        </div>
        <p class="mg-hint">
          Raids are the only source with a daily feed - a wars or playtime goal shows no chart
          unless one is chosen here.
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
                  <input class="mg-input" type="datetime-local" bind:value={newTrackerStarts} />
                </label>
                <label class="mg-field">
                  <span class="mg-label">Ends (UTC)</span>
                  <input class="mg-input" type="datetime-local" bind:value={newTrackerEnds} />
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
        <span class="mg-preview-spark" style="color: {accent}" aria-hidden="true">✦</span>
        <span
          class="mg-preview-name"
          style="background-image: linear-gradient(90deg, {accent}, {accentSecondary})"
        >
          {name || "Event name"}
        </span>
        <span class="mg-preview-tagline">{tagline || "Tagline."}</span>
        {#if previewGoal}
          <div class="mg-preview-goal">
            <GoalMeter goal={previewGoal} current={null} size="band" />
          </div>
        {/if}
      </div>
    </EventSky>
    <p class="mg-hint">How the hub band and page hero pick up the sky.</p>
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
