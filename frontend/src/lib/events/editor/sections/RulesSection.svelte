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

<FormSection id="rules" title="Rules" class="evf-half">
  <Field label="One rule per line">
    <TextArea rows={4} bind:value={draft.rules} bind:element={input} />
  </Field>
  <EmojiPicker textarea={input} bind:value={draft.rules} />
</FormSection>
