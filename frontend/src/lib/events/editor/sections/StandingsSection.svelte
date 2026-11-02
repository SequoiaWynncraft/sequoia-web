<script lang="ts">
  import { getContext } from "svelte";

  import Button from "#lib/design-system/components/Button.svelte";
  import Field from "#lib/design-system/components/forms/Field.svelte";
  import FormSection from "#lib/design-system/components/forms/FormSection.svelte";
  import InstantField from "#lib/design-system/components/forms/InstantField.svelte";
  import Select from "#lib/design-system/components/forms/Select.svelte";
  import TextInput from "#lib/design-system/components/forms/TextInput.svelte";
  import Toggle from "#lib/design-system/components/forms/Toggle.svelte";
  import { KNOWN_RAIDS } from "#lib/site/raids.js";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);

  let trackerSubmit = $state<HTMLButtonElement | null>(null);
  const trackerSubmitInputTypes = new Set([
    "email",
    "number",
    "password",
    "search",
    "tel",
    "text",
    "time",
    "url",
  ]);

  /**
   * The rail's form-associated save button precedes the whole form in DOM
   * order and is therefore the form's default submitter - a bare Enter
   * inside the tracker editor would fire ?/save instead of the tracker
   * action. Route Enter to the tracker's own submit explicitly.
   */
  function submitTrackerOnEnter(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    // Only text-style inputs shortcut to the tracker action: a select's
    // or date picker's Enter confirms its highlighted value, and hijacking
    // it would submit the tracker with the PREVIOUS selection still applied.
    if (
      !(event.target instanceof HTMLInputElement) ||
      !trackerSubmitInputTypes.has(event.target.type)
    )
      return;
    event.preventDefault();
    trackerSubmit?.click();
  }
</script>

<FormSection id="standings" title="Standings">
  <Toggle
    bind:checked={draft.trackerEnabled}
    label="Show a standings board"
    hint="Per-member contributions from a raid or war-point tracker event."
  />
  {#if draft.trackerEnabled}
    {#if !draft.trackerManual}
      <Field label="Tracker event">
        <Select
          bind:value={draft.trackerEventId}
          onchange={(event) => draft.syncTracking(event.currentTarget.value)}
        >
          <option value="" disabled>Pick a tracker event</option>
          {#each draft.trackerChoices as option (option.id)}
            <option value={option.id}>
              {option.name} ({option.window}{option.raid ? ` - ${option.raid}` : ""})
            </option>
          {/each}
        </Select>
      </Field>
      <p class="seq-hint">
        {draft.trackerEventId
          ? draft.trackerTracking === "wars"
            ? "Counts war points via the guild mod."
            : `Counts ${draft.selectedTracker?.raid ?? "all guild raids"} via ${draft.trackerTracking === "mod" ? "the guild mod" : "the Wynncraft API"}.`
          : "Standings show each member's contribution inside the tracker window."}
        {#if draft.selectedTracker}
          <button type="button" class="seq-inline-link focus-ring" onclick={() => draft.openTrackerEdit()}>
            Edit tracker
          </button>
        {/if}
        <button type="button" class="seq-inline-link focus-ring" onclick={() => (draft.trackerManual = true)}>
          Enter an id manually
        </button>
        {#if draft.mode === "edit" && draft.trackerEventId}
          <!-- Server endpoint streams the full board - every roster member for
               mod-tracked windows - so managers get the raw numbers. -->
          <a
            class="seq-inline-link focus-ring"
            href={`/manage/events/${draft.liveInitial?.slug ?? draft.slug}/export?tracker=${encodeURIComponent(draft.trackerEventId)}`}
            download
          >
            Export CSV
          </a>
        {/if}
      </p>
    {:else}
      <div class="evf-grid-2">
        <Field label="Tracker event id">
          <TextInput mono bind:value={draft.trackerEventId} maxlength={64} spellcheck="false" />
        </Field>
        <Field label="Tracking source">
          <Select bind:value={draft.trackerTracking}>
            <option value="api">Wynncraft API</option>
            <option value="mod">Guild mod</option>
            <option value="wars">Guild mod - war points</option>
          </Select>
        </Field>
      </div>
      {#if draft.trackerChoices.length > 0}
        <p class="seq-hint">
          <button type="button" class="seq-inline-link focus-ring" onclick={() => draft.leaveManualMode()}>
            Pick from the tracker events instead
          </button>
        </p>
      {/if}
    {/if}

    {#if draft.trackerEditor !== "closed"}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="evf-tracker-new" onkeydown={submitTrackerOnEnter}>
        <span class="seq-field-label">
          {draft.trackerEditor === "edit" ? `Edit tracker: ${draft.newTrackerName}` : "New tracker event"}
        </span>
        <div class="evf-grid-2">
          <Field label="Name">
            <TextInput bind:value={draft.newTrackerName} maxlength={80} />
          </Field>
          <Field label="Tracking source">
            <Select bind:value={draft.newTrackerTracking}>
              <!-- Linked events read the board in the tracker's unit, so an
                   edit stays on its side of raids vs war points. -->
              {#if draft.trackerEditor !== "edit" || draft.trackerEditTracking !== "wars"}
                <option value="mod">Guild mod</option>
                <option value="api">Wynncraft API</option>
              {/if}
              {#if draft.trackerEditor !== "edit" || draft.trackerEditTracking === "wars"}
                <option value="wars">Guild mod - war points</option>
              {/if}
            </Select>
          </Field>
          <Field label="Starts (UTC)">
            <InstantField bind:value={draft.newTrackerStarts} name="Tracker start" />
          </Field>
          <Field label="Ends (UTC)">
            <InstantField bind:value={draft.newTrackerEnds} name="Tracker end" />
          </Field>
          {#if draft.newTrackerTracking === "mod"}
            <Field label="Which raids count">
              <Select bind:value={draft.newTrackerRaid}>
                <option value="">All guild raids</option>
                {#each KNOWN_RAIDS as raid (raid.key)}
                  <option value={raid.key}>{raid.key}</option>
                {/each}
              </Select>
            </Field>
          {/if}
        </div>
        <p class="seq-hint">
          {draft.newTrackerTracking === "mod"
            ? "The guild mod attributes completions per raid, so mod trackers can scope to one raid."
            : draft.newTrackerTracking === "wars"
              ? "Sums each member's war points from mod-reported wars inside the window."
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
          <Button
            size="sm"
            variant="ghost"
            onclick={() => (draft.trackerEditor = "closed")}
          >
            Cancel
          </Button>
          {#if draft.trackerAttempted && draft.trackerDraftError}
            <span class="seq-field-error" role="alert">{draft.trackerDraftError}</span>
          {:else if draft.serverTrackerError}
            <span class="seq-field-error" role="alert">{draft.serverTrackerError}</span>
          {/if}
        </div>
      </div>
    {:else}
      <p class="seq-hint">
        <button
          type="button"
          class="seq-inline-link seq-inline-link-solo focus-ring"
          onclick={() => draft.openTrackerCreator()}
        >
          + New tracker event
        </button>
      </p>
    {/if}
  {/if}
</FormSection>
