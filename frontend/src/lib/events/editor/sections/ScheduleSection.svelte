<script lang="ts">
  import { getContext } from "svelte";

  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import InstantField from "$lib/design-system/components/forms/InstantField.svelte";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);
</script>

<FormSection id="schedule" title="Schedule">
  <div class="evf-grid-2">
    <Field label="Starts (UTC)">
      <InstantField bind:value={draft.startsAt} name="Start" />
    </Field>
    <Field label="Ends (UTC)">
      <InstantField bind:value={draft.endsAt} name="End" />
    </Field>
  </div>
  <p class="evf-hint">Leave both empty while dates are TBA.</p>
</FormSection>
