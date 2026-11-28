<script lang="ts">
  import { getContext } from "svelte";

  import Field from "#lib/design-system/components/forms/Field.svelte";
  import FormSection from "#lib/design-system/components/forms/FormSection.svelte";
  import TextInput from "#lib/design-system/components/forms/TextInput.svelte";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);
</script>

<FormSection id="prizes" title="Prizes">
  {#each draft.prizes as prize (prize.id)}
    <div class="seq-repeat-row seq-repeat-row-prize">
      <input class="seq-input" aria-label="Donor" placeholder="Donor" bind:value={prize.donor} maxlength="80" />
      <input
        class="seq-input"
        placeholder="Player (links the donor)"
        bind:value={prize.donorPlayer}
        list="evf-member-list"
        maxlength="25"
        spellcheck="false"
        aria-label="Donor's Minecraft player"
      />
      <input class="seq-input" aria-label="Prize" placeholder="Prize" bind:value={prize.prize} maxlength="300" />
      <button
        type="button"
        class="seq-row-remove focus-ring"
        onclick={() => (draft.prizes = draft.prizes.filter((entry) => entry.id !== prize.id))}
        aria-label="Remove prize"
      >✕</button>
    </div>
  {/each}
  <button
    type="button"
    class="seq-row-add focus-ring"
    onclick={() => draft.prizes.push({ donor: "", prize: "", donorPlayer: "", id: draft.newRowId() })}
  >
    + Add prize
  </button>
  {#if draft.prizes.length > 0}
    <p class="seq-hint">Naming a player turns the donor into a link to their playercard.</p>
    <Field label="Note">
      <TextInput bind:value={draft.prizesNote} maxlength={500} />
    </Field>
  {/if}
</FormSection>
