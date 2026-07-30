<script lang="ts">
  import { setContext } from "svelte";
  import { enhance } from "$app/forms";

  import "./editor.css";

  import type { GuildEvent } from "$lib/events/types";
  import type { EventFormContext, TrackerOption } from "$lib/server/eventFormContext";
  import type { RaffleRoll as RaffleRollRecord } from "$lib/server/raffleRolls";

  import { EDITOR_KEY, EventDraft } from "./draft.svelte";
  import PreviewPane from "./PreviewPane.svelte";
  import SectionRail from "./SectionRail.svelte";
  import AboutSection from "./sections/AboutSection.svelte";
  import ActivitySection from "./sections/ActivitySection.svelte";
  import CompSection from "./sections/CompSection.svelte";
  import GoalsSection from "./sections/GoalsSection.svelte";
  import IconSection from "./sections/IconSection.svelte";
  import IdentitySection from "./sections/IdentitySection.svelte";
  import MilestonesSection from "./sections/MilestonesSection.svelte";
  import PrizesSection from "./sections/PrizesSection.svelte";
  import RafflesSection from "./sections/RafflesSection.svelte";
  import RulesSection from "./sections/RulesSection.svelte";
  import ScheduleSection from "./sections/ScheduleSection.svelte";
  import SkySection from "./sections/SkySection.svelte";
  import StandingsSection from "./sections/StandingsSection.svelte";

  let {
    mode,
    initial = null,
    initialPublished = false,
    initialUpdatedAt = null,
    context = null,
    rollHistory = null,
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
    /** Persisted draw records for the raffle history, newest first. */
    rollHistory?: RaffleRollRecord[] | null;
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

  const FORM_ID = "event-editor-form";

  // The draft deliberately seeds from the props once - the parent remounts
  // the editor via {#key} when the event changes. Live props (initial,
  // trackerCreated/Updated, trackerError) are synced by the effects below.
  // svelte-ignore state_referenced_locally
  const draft = new EventDraft({ mode, initial, initialPublished, initialUpdatedAt, context });
  setContext(EDITOR_KEY, draft);

  // A save that adds a raffle unlocks its roll button without a full reload -
  // the rollability checks read the live stored event, never the mount seed.
  $effect.pre(() => {
    draft.liveInitial = initial ?? null;
  });

  $effect.pre(() => {
    draft.serverTrackerError = trackerError;
  });

  $effect.pre(() => {
    draft.serverSaved = saved;
    draft.serverError = error;
    draft.serverAuditWarning = auditWarning;
  });

  $effect.pre(() => {
    draft.rollHistory = rollHistory ?? [];
  });

  // History capture after a quiet period. Replayed snapshots need no
  // suppression flag: applySnapshot re-points lastCaptured at the applied
  // state, so the debounced capture no-ops on equality, while a real edit
  // in the quiet window still differs and lands.
  $effect(() => {
    const current = draft.payload;
    draft.scheduleCapture(current);
    return () => draft.cancelCapture();
  });

  // Adopt a tracker the server just created: list it and select it.
  $effect(() => {
    const created = trackerCreated;
    if (created && !draft.trackerChoices.some((option) => option.id === created.id)) {
      draft.trackerChoices.push(created);
      draft.trackerEventId = created.id;
      draft.trackerTracking = created.tracking;
      draft.trackerManual = false;
      draft.trackerEditor = "closed";
    }
  });

  // Reflect a server-side tracker update into the picker list. The editor
  // closes on any update response - a no-op save is still a successful save.
  // Only the list mutation is guarded by equality, so the effect settles.
  $effect(() => {
    const updated = trackerUpdated;
    if (!updated) return;
    draft.trackerEditor = "closed";
    const index = draft.trackerChoices.findIndex((option) => option.id === updated.id);
    if (index >= 0 && JSON.stringify(draft.trackerChoices[index]) !== JSON.stringify(updated)) {
      draft.trackerChoices[index] = updated;
      if (draft.trackerEventId === updated.id) draft.trackerTracking = updated.tracking;
    }
  });

  // Removing or emptying a personal milestone drops it from milestoneOptions;
  // clear any milestone rule that pointed at it so the picker visibly resets
  // and no stale id lingers until serialization. Setting "" is stable (falsy,
  // so the effect no-ops on its own re-run).
  $effect(() => {
    const valid = new Set(draft.milestoneOptions.map((option) => option.id));
    for (const raffle of draft.raffles) {
      for (const rule of raffle.rules) {
        if (rule.type === "milestone" && rule.milestoneId && !valid.has(rule.milestoneId)) {
          rule.milestoneId = "";
        }
      }
    }
  });
</script>

<div class="evf-editor">
  <aside class="evf-side" aria-label="Editor navigation and preview">
    <SectionRail formId={FORM_ID} />
    <PreviewPane />
  </aside>

  <div class="evf-main">
    <div class="evf-toolbar">
      <div class="evf-presets">
        <select
          class="seq-input evf-preset-select"
          bind:value={draft.selectedPreset}
          onchange={() => (draft.confirmingPresetDelete = false)}
          aria-label="Saved presets"
        >
          <option value="">Presets…</option>
          {#each draft.presetChoices as preset (preset.name)}
            <option value={preset.name}>{preset.name}</option>
          {/each}
        </select>
        <button
          type="button"
          class="seq-button seq-button-secondary seq-button-sm"
          onclick={() => draft.loadPreset()}
          disabled={!draft.selectedPreset}
        >
          Load
        </button>
        <form method="POST" action="?/deletePreset" use:enhance={draft.presetDelete}>
          <input type="hidden" name="presetName" value={draft.selectedPreset} />
          {#if draft.confirmingPresetDelete}
            <button type="submit" class="seq-button seq-button-ghost seq-button-sm evf-preset-confirm">
              Confirm delete
            </button>
            <button
              type="button"
              class="seq-button seq-button-ghost seq-button-sm"
              onclick={() => (draft.confirmingPresetDelete = false)}
            >
              Keep
            </button>
          {:else}
            <button
              type="button"
              class="seq-button seq-button-ghost seq-button-sm"
              onclick={() => (draft.confirmingPresetDelete = true)}
              disabled={!draft.selectedPreset}
            >
              Delete
            </button>
          {/if}
        </form>
        <form class="evf-preset-save" method="POST" action="?/savePreset" use:enhance={draft.presetSubmit}>
          <input type="hidden" name="presetPayload" value={draft.presetPayload} />
          <input
            class="seq-input"
            name="presetName"
            bind:value={draft.newPresetName}
            placeholder="Preset name"
            maxlength="60"
          />
          <button
            type="submit"
            class="seq-button seq-button-secondary seq-button-sm"
            disabled={!draft.newPresetName.trim()}
          >
            Save preset
          </button>
        </form>
      </div>
    </div>
    {#if presetError}
      <p class="evf-toolbar-error"><span class="evf-error" role="alert">{presetError}</span></p>
    {/if}

    <form id={FORM_ID} method="POST" action="?/save" use:enhance={draft.submit}>
      <input type="hidden" name="payload" value={draft.payload} />
      <!-- The version the visible draft is based on (see knownUpdatedAt): own
           saves and rolls advance it so follow-up saves aren't rejected as
           stale, but a change this tab never displayed is. -->
      <input type="hidden" name="baseUpdatedAt" value={draft.knownUpdatedAt ?? ""} />
      <input type="hidden" name="trackerPayload" value={draft.trackerPayload} />

      <IdentitySection />
      <ScheduleSection />
      <SkySection />
      <IconSection />
      <AboutSection />
      <GoalsSection />
      <MilestonesSection />
      <ActivitySection />
      <PrizesSection />
      <CompSection />
      <RulesSection />
      <StandingsSection />
      <RafflesSection />

      <div class="evf-footer">
        <button type="submit" class="seq-button seq-button-primary seq-button-md" disabled={draft.saving}>
          {mode === "create" ? "Create event" : "Save changes"}
        </button>
        {#if mode === "edit"}
          <a class="evf-view focus-ring" href={`/events/${draft.slug}`}>View page</a>
        {/if}
        {#if draft.showValidation && draft.liveError}
          <span class="evf-error" role="alert">{draft.liveError}</span>
        {:else if error}
          <span class="evf-error" role="alert">{error}</span>
        {:else if saved}
          <span class="evf-saved">Saved</span>
        {/if}
        {#if auditWarning}
          <span class="evf-error" role="alert">Done, but not recorded in the audit log.</span>
        {/if}
      </div>
    </form>

    {#if draft.memberChoices.length > 0}
      <datalist id="evf-member-list">
        {#each draft.memberChoices as member (member.username)}
          <option value={member.username}></option>
        {/each}
      </datalist>
    {/if}

    {#if mode === "edit"}
      <form class="evf-danger" method="POST" action="?/delete" use:enhance>
        <!-- Same draft-pinned version token as the save form: deleting is only
             safe against the version the manager actually reviewed. -->
        <input type="hidden" name="baseUpdatedAt" value={draft.knownUpdatedAt ?? ""} />
        {#if draft.confirmingDelete}
          <span class="evf-error">This permanently removes the event.</span>
          <button type="submit" class="evf-delete focus-ring">Confirm delete</button>
          <button
            type="button"
            class="seq-button seq-button-ghost seq-button-sm"
            onclick={() => (draft.confirmingDelete = false)}
          >
            Keep
          </button>
        {:else}
          <button
            type="button"
            class="seq-button seq-button-ghost seq-button-sm"
            onclick={() => (draft.confirmingDelete = true)}
          >
            Delete event
          </button>
        {/if}
      </form>
    {/if}
  </div>

</div>
