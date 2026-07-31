<script lang="ts">
  import { getContext } from "svelte";

  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);
</script>

<FormSection id="milestones" title="Personal milestones">
  <p class="evf-hint">
    Per-member raid targets on the standings board - each member sees their own progress on
    the event page, and a raffle below can require one to enter. Needs a tracker (set under
    Standings) to count raids.
  </p>
  {#each draft.personalMilestones as milestone (milestone.key)}
    <div class="evf-repeat-row evf-repeat-milestone">
      <input
        class="seq-input"
        type="number"
        min="1"
        placeholder="Raids"
        bind:value={milestone.at}
        aria-label="Personal milestone target"
      />
      <input
        class="seq-input"
        placeholder="Unlocks, e.g. Rank Up eligibility"
        bind:value={milestone.unlock}
        maxlength="120"
        aria-label="Personal milestone unlock"
      />
      <button
        type="button"
        class="evf-remove focus-ring"
        onclick={() =>
          (draft.personalMilestones = draft.personalMilestones.filter(
            (entry) => entry.key !== milestone.key,
          ))}
        aria-label="Remove personal milestone"
      >✕</button>
    </div>
  {/each}
  <button
    type="button"
    class="evf-add focus-ring"
    onclick={() => draft.personalMilestones.push(draft.newPersonalMilestoneRow())}
  >
    + Add personal milestone
  </button>
  {#if draft.personalMilestones.length > 1}
    <p class="evf-hint">Targets must ascend.</p>
  {/if}
</FormSection>
