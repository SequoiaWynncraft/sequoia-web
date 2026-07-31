<script lang="ts">
  import { getContext } from "svelte";

  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import TextInput from "$lib/design-system/components/forms/TextInput.svelte";
  import Toggle from "$lib/design-system/components/forms/Toggle.svelte";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);
</script>

<FormSection id="identity" title="Identity">
  <div class="evf-grid-2">
    <Field label="Name">
      <TextInput bind:value={draft.name} oninput={() => draft.syncSlug()} maxlength={80} />
    </Field>
    {#if draft.mode === "create"}
      <Field label="Slug">
        <TextInput
          mono
          bind:value={draft.slug}
          oninput={() => (draft.slugEdited = true)}
          maxlength={64}
          spellcheck="false"
        />
      </Field>
    {:else}
      <Field label="Slug" element="div">
        <span class="evf-static">/events/{draft.slug}</span>
      </Field>
    {/if}
  </div>
  <Field label="Tagline">
    <TextInput bind:value={draft.tagline} maxlength={200} />
  </Field>
  <div class="evf-grid-2">
    <Field label="Access" element="label">
      <select class="seq-input" bind:value={draft.access}>
        <option value="members">Members</option>
        <option value="public">Public</option>
      </select>
    </Field>
    <Toggle
      bind:checked={draft.published}
      label="Listed on the events hub"
      hint="Unlisted drafts stay visible to managers."
    />
  </div>
</FormSection>
