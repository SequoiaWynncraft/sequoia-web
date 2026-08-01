<script lang="ts">
  import { getContext } from "svelte";

  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import TextInput from "$lib/design-system/components/forms/TextInput.svelte";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);
</script>

<FormSection id="comp" title="Suggested comp">
  {#each draft.compRoles as role (role.id)}
    <div class="seq-repeat-row seq-repeat-row-comp">
      <input class="seq-input" placeholder="Role" bind:value={role.role} maxlength="60" />
      <input class="seq-input" placeholder="Builds" bind:value={role.builds} maxlength="200" />
      <input class="seq-input" placeholder="Note" bind:value={role.note} maxlength="200" />
      <button
        type="button"
        class="seq-row-remove focus-ring"
        onclick={() => (draft.compRoles = draft.compRoles.filter((entry) => entry.id !== role.id))}
        aria-label="Remove role"
      >✕</button>
    </div>
  {/each}
  <button
    type="button"
    class="seq-row-add focus-ring"
    onclick={() => draft.compRoles.push({ role: "", builds: "", note: "", id: draft.newRowId() })}
  >
    + Add role
  </button>
  {#if draft.compRoles.length > 0}
    <Field label="Comp note">
      <TextInput bind:value={draft.compNote} maxlength={300} />
    </Field>
  {/if}
</FormSection>
