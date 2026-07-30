<script lang="ts">
  import { getContext } from "svelte";

  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import InstantField from "$lib/design-system/components/forms/InstantField.svelte";
  import Toggle from "$lib/design-system/components/forms/Toggle.svelte";

  import { EDITOR_KEY, EventDraft, RAFFLE_MAX_WINNERS } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);
</script>

<FormSection id="raffles" title="Raffles">
  <p class="evf-hint">
    Entrants earn one ticket per <em>raids / ticket</em> raids on the standings board,
    counted inside each raffle's window. Set up each raffle, save, then roll each winner
    below - re-rolling replaces that slot.
  </p>
  {#if draft.raffles.length > 1}
    <Toggle
      bind:checked={draft.raffleExcludeWinners}
      label="Exclude winners from other raffles"
      hint="A member who wins any raffle is dropped from every other draw here."
    />
  {/if}
  {#each draft.raffles as raffle (raffle.key)}
    <div class="evf-raffle">
      <div class="evf-repeat-row evf-repeat-raffle">
        <input class="seq-input" placeholder="Prize" bind:value={raffle.prize} maxlength="300" />
        <Field label="Winners" tight>
          <input
            class="seq-input"
            type="number"
            min="1"
            max={RAFFLE_MAX_WINNERS}
            bind:value={raffle.winnerCount}
          />
        </Field>
        <Field label="Raids / ticket" tight>
          <input class="seq-input" type="number" min="1" bind:value={raffle.perTicket} />
        </Field>
        <button
          type="button"
          class="evf-remove focus-ring"
          onclick={() => (draft.raffles = draft.raffles.filter((entry) => entry.key !== raffle.key))}
          aria-label="Remove raffle"
        >✕</button>
      </div>
      <div class="evf-grid-2">
        <Field label="Ticket window start (UTC)">
          <InstantField bind:value={raffle.windowFrom} name="Raffle window start" />
        </Field>
        <Field label="Ticket window end (UTC)">
          <InstantField bind:value={raffle.windowTo} name="Raffle window end" />
        </Field>
      </div>
      {#if draft.milestoneOptions.length > 0}
        <Field
          label="Requires personal milestone"
          hint="Only members who reached this milestone (full event standings) may enter."
        >
          <select class="seq-input" bind:value={raffle.requiresMilestone}>
            <option value="">No requirement</option>
            {#each draft.milestoneOptions as option (option.id)}
              <option value={option.id}>{option.label}</option>
            {/each}
          </select>
        </Field>
      {/if}
    </div>
  {/each}
  <button type="button" class="evf-add focus-ring" onclick={() => draft.raffles.push(draft.newRaffleRow())}>
    + Add raffle
  </button>

  {#if draft.raffleSlots.length > 0}
    <div class="evf-raffle-results" role="table" aria-label="Raffle winners">
      <div class="evf-raffle-result evf-raffle-result-head" role="row">
        <span role="columnheader">Winner</span>
        <span role="columnheader">Prize</span>
        <span role="columnheader" class="evf-raffle-roll-head">Roll</span>
      </div>
      {#each draft.raffleSlots as row (row.key)}
        <div class="evf-raffle-result" role="row">
          <span
            class="evf-raffle-cell"
            class:evf-raffle-unrolled={!row.winner}
            role="cell"
          >{row.winner ? row.winner.username : "Not rolled"}</span>
          <span class="evf-raffle-cell" role="cell">{row.prize || "—"}</span>
          <span class="evf-raffle-roll-cell" role="cell">
            {#if row.saved}
              <button
                type="submit"
                formaction="?/rollRaffle"
                formnovalidate
                name="rollTarget"
                value={`${row.raffleId}:${row.slot}`}
                class="evf-roll-btn focus-ring"
                disabled={draft.rollingId !== null}
                aria-label={row.winner ? "Re-roll this winner" : "Roll this winner"}
                title={row.winner ? "Re-roll" : "Roll"}
              >↺</button>
            {:else}
              <span class="evf-raffle-savefirst">Save first</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}
  {#if draft.rollError}
    <span class="evf-error" role="alert">{draft.rollError}</span>
  {/if}
</FormSection>
