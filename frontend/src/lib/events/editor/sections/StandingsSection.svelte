<script lang="ts">
  import { getContext } from "svelte";

  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import InstantField from "$lib/design-system/components/forms/InstantField.svelte";
  import TextInput from "$lib/design-system/components/forms/TextInput.svelte";
  import Toggle from "$lib/design-system/components/forms/Toggle.svelte";
  import { KNOWN_RAIDS } from "$lib/site/raids";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);

  let trackerSubmit = $state<HTMLButtonElement | null>(null);

  /**
   * The rail's form-associated save button precedes the whole form in DOM
   * order and is therefore the form's default submitter - a bare Enter
   * inside the tracker editor would fire ?/save instead of the tracker
   * action. Route Enter to the tracker's own submit explicitly.
   */
  function submitTrackerOnEnter(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
    event.preventDefault();
    trackerSubmit?.click();
  }
</script>

<FormSection id="standings" title="Standings">
  <Toggle
    bind:checked={draft.trackerEnabled}
    label="Show a standings board"
    hint="Per-member contributions from a raid tracker event."
  />
  {#if draft.trackerEnabled}
    {#if !draft.trackerManual}
      <Field label="Tracker event">
        <select
          class="seq-input"
          bind:value={draft.trackerEventId}
          onchange={(event) => draft.syncTracking(event.currentTarget.value)}
        >
          <option value="" disabled>Pick a tracker event</option>
          {#each draft.trackerChoices as option (option.id)}
            <option value={option.id}>
              {option.name} ({option.window}{option.raid ? ` - ${option.raid}` : ""})
            </option>
          {/each}
        </select>
      </Field>
      <p class="evf-hint">
        {draft.trackerEventId
          ? `Counts ${draft.selectedTracker?.raid ?? "all guild raids"} via ${draft.trackerTracking === "mod" ? "the guild mod" : "the Wynncraft API"}.`
          : "Standings show each member's contribution inside the tracker window."}
        {#if draft.selectedTracker}
          <button type="button" class="evf-inline-link focus-ring" onclick={() => draft.openTrackerEdit()}>
            Edit tracker
          </button>
        {/if}
        <button type="button" class="evf-inline-link focus-ring" onclick={() => (draft.trackerManual = true)}>
          Enter an id manually
        </button>
      </p>
    {:else}
      <div class="evf-grid-2">
        <Field label="Tracker event id">
          <TextInput mono bind:value={draft.trackerEventId} maxlength={64} spellcheck="false" />
        </Field>
        <Field label="Tracking source">
          <select class="seq-input" bind:value={draft.trackerTracking}>
            <option value="api">Wynncraft API</option>
            <option value="mod">Guild mod</option>
          </select>
        </Field>
      </div>
      {#if draft.trackerChoices.length > 0}
        <p class="evf-hint">
          <button type="button" class="evf-inline-link focus-ring" onclick={() => draft.leaveManualMode()}>
            Pick from the tracker events instead
          </button>
        </p>
      {/if}
    {/if}

    {#if draft.trackerEditor !== "closed"}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="evf-tracker-new" onkeydown={submitTrackerOnEnter}>
        <span class="evf-tracker-label">
          {draft.trackerEditor === "edit" ? `Edit tracker: ${draft.newTrackerName}` : "New tracker event"}
        </span>
        <div class="evf-grid-2">
          <Field label="Name">
            <TextInput bind:value={draft.newTrackerName} maxlength={80} />
          </Field>
          <Field label="Tracking source">
            <select class="seq-input" bind:value={draft.newTrackerTracking}>
              <option value="mod">Guild mod</option>
              <option value="api">Wynncraft API</option>
            </select>
          </Field>
          <Field label="Starts (UTC)">
            <InstantField bind:value={draft.newTrackerStarts} name="Tracker start" />
          </Field>
          <Field label="Ends (UTC)">
            <InstantField bind:value={draft.newTrackerEnds} name="Tracker end" />
          </Field>
          {#if draft.newTrackerTracking === "mod"}
            <Field label="Which raids count">
              <select class="seq-input" bind:value={draft.newTrackerRaid}>
                <option value="">All guild raids</option>
                {#each KNOWN_RAIDS as raid (raid.key)}
                  <option value={raid.key}>{raid.key}</option>
                {/each}
              </select>
            </Field>
          {/if}
        </div>
        <p class="evf-hint">
          {draft.newTrackerTracking === "mod"
            ? "The guild mod attributes completions per raid, so mod trackers can scope to one raid."
            : "API counter diffs count all guild raids together - no per-raid scoping."}
        </p>
        <div class="evf-tracker-new-actions">
          <button
            bind:this={trackerSubmit}
            type="submit"
            formaction={draft.trackerEditor === "edit" ? "?/updateTracker" : "?/createTracker"}
            formnovalidate
            class="seq-button seq-button-secondary seq-button-sm"
            disabled={draft.trackerBusy}
          >
            {draft.trackerEditor === "edit" ? "Save tracker" : "Create tracker"}
          </button>
          <button
            type="button"
            class="seq-button seq-button-ghost seq-button-sm"
            onclick={() => (draft.trackerEditor = "closed")}
          >
            Cancel
          </button>
          {#if draft.trackerAttempted && draft.trackerDraftError}
            <span class="evf-error" role="alert">{draft.trackerDraftError}</span>
          {:else if draft.serverTrackerError}
            <span class="evf-error" role="alert">{draft.serverTrackerError}</span>
          {/if}
        </div>
      </div>
    {:else}
      <p class="evf-hint">
        <button
          type="button"
          class="evf-inline-link evf-inline-link-solo focus-ring"
          onclick={() => draft.openTrackerCreator()}
        >
          + New tracker event
        </button>
      </p>
    {/if}
  {/if}
</FormSection>

<style>
  .evf-tracker-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }
</style>
