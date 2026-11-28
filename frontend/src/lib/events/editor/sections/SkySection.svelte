<script lang="ts">
  import { getContext } from "svelte";

  import Field from "#lib/design-system/components/forms/Field.svelte";
  import FormSection from "#lib/design-system/components/forms/FormSection.svelte";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);
</script>

<FormSection id="sky" title="Sky" class="evf-half">
  <div class="evf-grid-colors">
    <Field label="Sky top">
      <span class="evf-color-pair">
        <input type="color" bind:value={draft.skyTop} />
        <input class="seq-input seq-input-mono" bind:value={draft.skyTop} maxlength="7" spellcheck="false" />
      </span>
    </Field>
    <Field label="Sky bottom">
      <span class="evf-color-pair">
        <input type="color" bind:value={draft.skyBottom} />
        <input class="seq-input seq-input-mono" bind:value={draft.skyBottom} maxlength="7" spellcheck="false" />
      </span>
    </Field>
    <Field label="Accent">
      <span class="evf-color-pair">
        <input type="color" bind:value={draft.accent} />
        <input class="seq-input seq-input-mono" bind:value={draft.accent} maxlength="7" spellcheck="false" />
      </span>
    </Field>
    <Field label="Accent 2">
      <span class="evf-color-pair">
        <input type="color" bind:value={draft.accentSecondary} />
        <input class="seq-input seq-input-mono" bind:value={draft.accentSecondary} maxlength="7" spellcheck="false" />
      </span>
    </Field>
    <Field label="Stars">
      <span class="evf-color-pair">
        <input type="color" bind:value={draft.star} />
        <input class="seq-input seq-input-mono" bind:value={draft.star} maxlength="7" spellcheck="false" />
      </span>
    </Field>
  </div>
</FormSection>
