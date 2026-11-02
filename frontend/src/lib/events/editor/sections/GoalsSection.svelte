<script lang="ts">
  import { getContext } from "svelte";

  import Field from "#lib/design-system/components/forms/Field.svelte";
  import FormSection from "#lib/design-system/components/forms/FormSection.svelte";
  import Select from "#lib/design-system/components/forms/Select.svelte";
  import TextInput from "#lib/design-system/components/forms/TextInput.svelte";
  import Toggle from "#lib/design-system/components/forms/Toggle.svelte";
  import { KNOWN_RAIDS } from "#lib/site/raids.js";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);

  function raidOptionsFor(selected: string): string[] {
    const names = KNOWN_RAIDS.map((raid) => raid.key);
    return selected && !names.includes(selected) ? [...names, selected] : names;
  }
</script>

<FormSection id="goals" title="Goals">
  <Toggle
    bind:checked={draft.goalEnabled}
    label="Track goals"
    onchange={(event) => {
      // The explicit handler can run before bind:checked applies -
      // read the DOM state, not the bound one.
      if (event.currentTarget.checked && draft.goals.length === 0) {
        draft.goals.push(draft.newGoalRow());
      }
    }}
  />
  {#if draft.goalEnabled}
    {#each draft.goals as goal, goalIndex (goal.id)}
      <div class="evf-goal">
        <div class="evf-goal-head">
          <span class="seq-field-label">Goal {goalIndex + 1}</span>
          <button
            type="button"
            class="seq-row-remove focus-ring"
            onclick={() => (draft.goals = draft.goals.filter((entry) => entry.id !== goal.id))}
            aria-label="Remove goal {goalIndex + 1}"
          >✕</button>
        </div>
        <Field label="Metric">
          <TextInput bind:value={goal.metric} placeholder="guild raids" maxlength={80} />
        </Field>
        <Field label="Milestones" element="div">
          {#each goal.milestones as milestone (milestone.id)}
            <div class="seq-repeat-row seq-repeat-row-goal-milestone">
              <input
                class="seq-input"
                type="number"
                min="1"
                placeholder="Target"
                bind:value={milestone.at}
                aria-label="Milestone target"
              />
              <input
                class="seq-input"
                placeholder="Unlocks, e.g. Rank Up Raffle"
                bind:value={milestone.unlock}
                maxlength="120"
                aria-label="Milestone unlock"
              />
              <input
                class="seq-input"
                placeholder="Marker"
                bind:value={milestone.label}
                maxlength="24"
                aria-label="Milestone marker label"
              />
              <button
                type="button"
                class="seq-row-remove focus-ring"
                onclick={() =>
                  (goal.milestones = goal.milestones.filter((entry) => entry.id !== milestone.id))}
                aria-label="Remove milestone"
              >✕</button>
            </div>
          {/each}
          <button
            type="button"
            class="seq-row-add focus-ring"
            onclick={() => goal.milestones.push(draft.newMilestoneRow())}
          >
            + Add milestone
          </button>
          <p class="seq-hint">Targets must ascend - the last one is the headline target.</p>
        </Field>
        <Field label="Milestone display" element="div">
          <div class="seq-choices" role="radiogroup" aria-label="Goal {goalIndex + 1} milestone display">
            <label class="seq-choice" class:seq-choice-selected={goal.milestoneStyle === "list"}>
              <input class="seq-choice-input" type="radio" name="goal-mstyle-{goal.id}" value="list" bind:group={goal.milestoneStyle} />
              <span class="seq-choice-title">List</span>
              <span class="seq-choice-desc">Every unlock as a ✦ line below the meter.</span>
            </label>
            <label class="seq-choice" class:seq-choice-selected={goal.milestoneStyle === "markers"}>
              <input class="seq-choice-input" type="radio" name="goal-mstyle-{goal.id}" value="markers" bind:group={goal.milestoneStyle} />
              <span class="seq-choice-title">Markers</span>
              <span class="seq-choice-desc">Waypoints under the bar at each target - marker text always visible, the unlock on hover or tap.</span>
            </label>
            <label class="seq-choice" class:seq-choice-selected={goal.milestoneStyle === "both"}>
              <input class="seq-choice-input" type="radio" name="goal-mstyle-{goal.id}" value="both" bind:group={goal.milestoneStyle} />
              <span class="seq-choice-title">Markers + list</span>
              <span class="seq-choice-desc">Waypoints under the bar and the full list below.</span>
            </label>
            <label class="seq-choice" class:seq-choice-selected={goal.milestoneStyle === "none"}>
              <input class="seq-choice-input" type="radio" name="goal-mstyle-{goal.id}" value="none" bind:group={goal.milestoneStyle} />
              <span class="seq-choice-title">Ticks only</span>
              <span class="seq-choice-desc">Bare notches on the track, nothing below.</span>
            </label>
          </div>
          <p class="seq-hint">Markers use each milestone's marker text; empty markers show the target count.</p>
        </Field>
        <Field label="Data source" element="div">
          <div class="seq-choices" role="radiogroup" aria-label="Goal {goalIndex + 1} data source">
            <label class="seq-choice" class:seq-choice-selected={goal.source === "raids"}>
              <input class="seq-choice-input" type="radio" name="goal-source-{goal.id}" value="raids" bind:group={goal.source} />
              <span class="seq-choice-title">Guild raid feed</span>
              <span class="seq-choice-desc">Member participation credits from the activity feed - party size inflates them.</span>
            </label>
            <label class="seq-choice" class:seq-choice-selected={goal.source === "raidRuns"}>
              <input class="seq-choice-input" type="radio" name="goal-source-{goal.id}" value="raidRuns" bind:group={goal.source} />
              <span class="seq-choice-title">Mod completions</span>
              <span class="seq-choice-desc">Counts unique runs from the guild mod - one per party, misses runs without a mod user.</span>
            </label>
            <label class="seq-choice" class:seq-choice-selected={goal.source === "warPoints"}>
              <input class="seq-choice-input" type="radio" name="goal-source-{goal.id}" value="warPoints" bind:group={goal.source} />
              <span class="seq-choice-title">War points</span>
              <span class="seq-choice-desc">Sums war points from mod-reported wars inside the event window - wars still being scored add once calculated.</span>
            </label>
            <label class="seq-choice" class:seq-choice-selected={goal.source === "wars"}>
              <input class="seq-choice-input" type="radio" name="goal-source-{goal.id}" value="wars" bind:group={goal.source} />
              <span class="seq-choice-title">War feed</span>
              <span class="seq-choice-desc">Sums wars from the daily stat rollups - whole UTC days.</span>
            </label>
            <label class="seq-choice" class:seq-choice-selected={goal.source === "playtime"}>
              <input class="seq-choice-input" type="radio" name="goal-source-{goal.id}" value="playtime" bind:group={goal.source} />
              <span class="seq-choice-title">Playtime feed</span>
              <span class="seq-choice-desc">Sums hours played from the daily stat rollups - whole UTC days.</span>
            </label>
            <label class="seq-choice" class:seq-choice-selected={goal.source === "manual"}>
              <input class="seq-choice-input" type="radio" name="goal-source-{goal.id}" value="manual" bind:group={goal.source} />
              <span class="seq-choice-title">Manual</span>
              <span class="seq-choice-desc">No live wiring - the meter shows the total entered below.</span>
            </label>
          </div>
        </Field>
        <div class="evf-grid-2">
          {#if goal.source === "raids" || goal.source === "raidRuns"}
            <Field label="Which raids count">
              <Select bind:value={goal.raid}>
                <option value="">All guild raids</option>
                {#each raidOptionsFor(goal.raid) as raid (raid)}
                  <option value={raid}>{raid}</option>
                {/each}
              </Select>
            </Field>
          {/if}
          <Field label={goal.source === "manual" ? "Total so far" : "Final total"}>
            <input class="seq-input" type="number" min="0" bind:value={goal.finalTotal} />
          </Field>
        </div>
        <p class="seq-hint">
          {goal.source === "manual"
            ? "Update the total by hand as the event progresses."
            : "Final total is optional - set it once the event has ended to freeze the meter."}
        </p>
      </div>
    {/each}
    <button type="button" class="seq-row-add focus-ring" onclick={() => draft.goals.push(draft.newGoalRow())}>
      + Add goal
    </button>
  {/if}
</FormSection>
