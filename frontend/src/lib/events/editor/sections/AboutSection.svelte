<script lang="ts">
  import { getContext } from "svelte";

  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import TextArea from "$lib/design-system/components/forms/TextArea.svelte";
  import EmojiPicker from "$lib/emoji/EmojiPicker.svelte";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);

  let input = $state<HTMLTextAreaElement>();
</script>

<FormSection id="about" title="About" class="evf-half">
  <Field label="Hero lead">
    <TextArea rows={4} bind:value={draft.about} bind:element={input} />
  </Field>
  <p class="seq-hint">Blank line between paragraphs.</p>
  <EmojiPicker textarea={input} bind:value={draft.about} />
</FormSection>
