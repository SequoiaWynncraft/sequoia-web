<script lang="ts">
  import { getContext } from "svelte";

  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import { RAID_ICONS, raidIconUrl } from "$lib/events/raidIcons";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);
</script>

<FormSection id="icon" title="Icon" class="evf-half">
  <div class="evf-icon-grid" role="group" aria-label="Event icon">
    <button
      type="button"
      class="evf-icon-option focus-ring"
      class:evf-icon-option-selected={draft.iconFile === ""}
      aria-pressed={draft.iconFile === ""}
      onclick={() => (draft.iconFile = "")}
    >
      <span class="evf-icon-none" aria-hidden="true">✕</span>
      <span class="evf-icon-label">None</span>
    </button>
    {#each RAID_ICONS as icon (icon.file)}
      <button
        type="button"
        class="evf-icon-option focus-ring"
        class:evf-icon-option-selected={draft.iconFile === icon.file}
        aria-pressed={draft.iconFile === icon.file}
        onclick={() => (draft.iconFile = icon.file)}
      >
        <img src={raidIconUrl(icon.file)} alt="" loading="lazy" />
        <span class="evf-icon-label">{icon.label}</span>
      </button>
    {/each}
  </div>
  {#if draft.iconFile}
    <Field label="Shown on" element="div">
      <div class="evf-icon-placements">
        <label class="evf-check">
          <input type="checkbox" value="hero" bind:group={draft.iconPlacements} />
          <span>
            Hero
            <small>Event page, above the name.</small>
          </span>
        </label>
        <label class="evf-check">
          <input type="checkbox" value="band" bind:group={draft.iconPlacements} />
          <span>
            Band
            <small>Marks the event's row on the hub.</small>
          </span>
        </label>
        <label class="evf-check">
          <input type="checkbox" value="meta" bind:group={draft.iconPlacements} />
          <span>
            Meta
            <small>Next to the status line.</small>
          </span>
        </label>
        <label class="evf-check">
          <input type="checkbox" value="manage" bind:group={draft.iconPlacements} />
          <span>
            Manage
            <small>Marks the event's row in the manage list.</small>
          </span>
        </label>
      </div>
    </Field>
  {/if}
</FormSection>
