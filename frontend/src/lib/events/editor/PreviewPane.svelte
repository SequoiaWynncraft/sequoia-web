<script lang="ts">
  import { getContext } from "svelte";

  import SectionLabel from "#lib/design-system/components/SectionLabel.svelte";
  import EventSky from "#lib/events/components/EventSky.svelte";
  import GoalMeter from "#lib/events/components/GoalMeter.svelte";
  import { raidIconUrl } from "#lib/events/raidIcons.js";

  import { EDITOR_KEY, EventDraft } from "./draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);
</script>

<div>
  <SectionLabel>Preview</SectionLabel>
  <EventSky theme={draft.theme}>
    <div class="evf-preview">
      {#if draft.iconFile && draft.iconPlacements.includes("hero")}
        <img class="evf-preview-icon" src={raidIconUrl(draft.iconFile)} alt="" />
      {:else}
        <span class="evf-preview-spark" style="color: {draft.accent}" aria-hidden="true">✦</span>
      {/if}
      <span
        class="evf-preview-name"
        style="background-image: linear-gradient(90deg, {draft.accent}, {draft.accentSecondary})"
      >
        {draft.name || "Event name"}
      </span>
      <span class="evf-preview-tagline">{draft.tagline || "Tagline."}</span>
      {#if draft.previewGoals[0]}
        <div class="evf-preview-goal">
          <GoalMeter goal={draft.previewGoals[0]} current={null} size="band" />
        </div>
      {/if}
    </div>
  </EventSky>
  <p class="seq-hint">How the hub band and page hero pick up the sky.</p>

  {#if draft.previewGoals.length > 0}
    <div
      class="evf-goal-preview"
      style="--ev-accent: {draft.accent}; --ev-accent-2: {draft.accentSecondary}"
    >
      <SectionLabel>Goal preview</SectionLabel>
      {#each draft.previewGoals as goal, index (index)}
        {@const finalAt = goal.milestones.at(-1)?.at ?? 1}
        {@const percent = draft.goals[index]?.previewPercent ?? 60}
        <div class="evf-goal-preview-item">
          <GoalMeter {goal} current={Math.round((finalAt * percent) / 100)} />
          {#if draft.goals[index]}
            <label class="evf-goal-preview-slider">
              <span class="seq-field-label">Preview progress</span>
              <input type="range" min="0" max="120" step="1" bind:value={draft.goals[index].previewPercent} />
            </label>
          {/if}
        </div>
      {/each}
      <p class="seq-hint">Drag to see the meter at any point of the event.</p>
    </div>
  {/if}
</div>

<style>
  .evf-goal-preview {
    margin-top: 24px;
  }
</style>
