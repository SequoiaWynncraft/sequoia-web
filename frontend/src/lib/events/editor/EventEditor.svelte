<script lang="ts">
  import { setContext } from "svelte";
  import { enhance } from "$app/forms";

  import "./editor.css";

  import type { GuildEvent } from "#lib/events/types.js";
  import type { EventFormContext, TrackerOption } from "#lib/server/eventFormContext.js";
  import type { RaffleRoll as RaffleRollRecord } from "#lib/server/raffleRolls.js";

  import Button from "#lib/design-system/components/Button.svelte";
  import ConfirmDialog from "#lib/design-system/components/forms/ConfirmDialog.svelte";
  import FormStatus from "#lib/design-system/components/forms/FormStatus.svelte";
  import Select from "#lib/design-system/components/forms/Select.svelte";
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
    rollWarning = false,
  }: {
    mode: "create" | "edit";
    initial?: GuildEvent | null;
    initialPublished?: boolean;
    initialUpdatedAt?: number | null;
    context?: EventFormContext | null;
    rollHistory?: RaffleRollRecord[] | null;
    error?: string | null;
    saved?: boolean;
    trackerCreated?: TrackerOption | null;
    trackerUpdated?: TrackerOption | null;
    trackerError?: string | null;
    presetError?: string | null;
    auditWarning?: boolean;
    rollWarning?: boolean;
  } = $props();

  const FORM_ID = "event-editor-form";

  const draft = new EventDraft({ mode, initial, initialPublished, initialUpdatedAt, context });
  setContext(EDITOR_KEY, draft);

  let presetDeleteForm = $state<HTMLFormElement>();
  let eventDeleteForm = $state<HTMLFormElement>();
  let confirmPresetDelete = $state<ConfirmDialog | null>(null);
  let confirmEventDelete = $state<ConfirmDialog | null>(null);

  const footerError = $derived(
    draft.showValidation && draft.liveError ? draft.liveError : error,
  );
  const footerWarning = $derived(
    auditWarning
      ? "Done, but not recorded in the audit log."
      : rollWarning
        ? "Rolled, but the stage replay was not recorded - viewers see the winner without a spin."
        : null,
  );

  function deletePresetConfirmed() {
    presetDeleteForm?.requestSubmit();
  }

  function deleteEventConfirmed() {
    eventDeleteForm?.requestSubmit();
  }

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
    draft.serverRollWarning = rollWarning;
  });

  $effect.pre(() => {
    draft.rollHistory = rollHistory ?? [];
  });

  $effect(() => {
    const current = draft.payload;
    draft.scheduleCapture(current);
    return () => draft.cancelCapture();
  });

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
        <Select
          class="evf-preset-select"
          bind:value={draft.selectedPreset}
          aria-label="Saved presets"
        >
          <option value="">Presets…</option>
          {#each draft.presetChoices as preset (preset.name)}
            <option value={preset.name}>{preset.name}</option>
          {/each}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          onclick={() => draft.loadPreset()}
          disabled={!draft.selectedPreset}
        >
          Load
        </Button>
        <form bind:this={presetDeleteForm} method="POST" action="?/deletePreset" use:enhance={draft.presetDelete}>
          <input type="hidden" name="presetName" value={draft.selectedPreset} />
          <Button
            size="sm"
            variant="ghost"
            onclick={() => confirmPresetDelete?.open()}
            disabled={!draft.selectedPreset}
          >
            Delete
          </Button>
          <ConfirmDialog
            bind:this={confirmPresetDelete}
            title="Delete preset"
            confirmLabel="Confirm delete"
            cancelLabel="Keep"
            danger
            onconfirm={deletePresetConfirmed}
          />
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
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={!draft.newPresetName.trim()}
          >
            Save preset
          </Button>
        </form>
      </div>
    </div>
    {#if presetError}
      <p class="evf-toolbar-error"><span class="seq-field-error" role="alert">{presetError}</span></p>
    {/if}

    <form id={FORM_ID} class="evf-form" method="POST" action="?/save" use:enhance={draft.submit}>
      <input type="hidden" name="payload" value={draft.payload} />
      <input type="hidden" name="baseUpdatedAt" value={draft.knownUpdatedAt ?? ""} />
      <input type="hidden" name="trackerPayload" value={draft.trackerPayload} />

      <IdentitySection />
      <ScheduleSection />
      <SkySection />
      <IconSection />
      <AboutSection />
      <RulesSection />
      <ActivitySection />
      <GoalsSection />
      <MilestonesSection />
      <StandingsSection />
      <PrizesSection />
      <CompSection />
      <RafflesSection />

      <div class="evf-footer">
        <Button type="submit" disabled={draft.saving}>
          {mode === "create" ? "Create event" : "Save changes"}
        </Button>
        {#if mode === "edit"}
          <a class="evf-view focus-ring" href={`/events/${draft.slug}`}>View page</a>
        {/if}
        <FormStatus error={footerError} warning={footerWarning} {saved} compact />
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
      <form bind:this={eventDeleteForm} class="evf-danger" method="POST" action="?/delete" use:enhance>
        <input type="hidden" name="baseUpdatedAt" value={draft.knownUpdatedAt ?? ""} />
        <Button size="sm" variant="ghost" onclick={() => confirmEventDelete?.open()}>
          Delete event
        </Button>
        <ConfirmDialog
          bind:this={confirmEventDelete}
          title="Delete event"
          body="This permanently removes the event."
          confirmLabel="Confirm delete"
          cancelLabel="Keep"
          danger
          onconfirm={deleteEventConfirmed}
        />
      </form>
    {/if}
  </div>

</div>
