<script lang="ts">
  import { getContext } from "svelte";

  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import TextArea from "$lib/design-system/components/forms/TextArea.svelte";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);
</script>

<FormSection id="about" title="About" class="evf-half">
  <Field label="Hero lead">
    <TextArea rows={4} bind:value={draft.about} />
  </Field>
  <p class="seq-hint">Blank line between paragraphs.</p>
</FormSection>
