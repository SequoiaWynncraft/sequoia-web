<script lang="ts">
  import type { EventGoal } from "../types";

  let {
    goal,
    current,
    size = "full",
  }: {
    goal: EventGoal;
    /** Null when the count is unknown (feed down or event not started). */
    current: number | null;
    size?: "band" | "full";
  } = $props();

  const shown = $derived(current ?? goal.finalTotal ?? null);
  const fraction = $derived(shown === null ? 0 : Math.min(1, shown / goal.target));
  const unlocked = $derived(shown !== null && shown >= goal.target);
</script>

<div class="goal goal-{size}">
  {#if size === "full"}
    <div class="goal-figures">
      <span class="goal-current" class:goal-current-unlocked={unlocked}>
        {shown === null ? "-" : shown.toLocaleString()}
      </span>
      <span class="goal-target">of {goal.target.toLocaleString()} {goal.metricLabel}</span>
    </div>
  {/if}
  <div
    class="goal-track"
    role="meter"
    aria-valuemin={0}
    aria-valuemax={goal.target}
    aria-valuenow={Math.min(shown ?? 0, goal.target)}
    aria-label="{goal.metricLabel} toward {goal.unlock}"
  >
    <div class="goal-fill" style="width:{fraction * 100}%"></div>
  </div>
  <div class="goal-unlock" class:goal-unlock-reached={unlocked}>
    <span class="goal-spark" aria-hidden="true">✦</span>
    {#if unlocked}
      {goal.unlock} unlocked
    {:else}
      {goal.unlock} at {goal.target.toLocaleString()}
    {/if}
  </div>
</div>

<style>
  .goal {
    display: grid;
    gap: 8px;
  }

  .goal-band {
    gap: 6px;
  }

  .goal-figures {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .goal-current {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    line-height: var(--leading-tight);
  }

  .goal-current-unlocked {
    color: var(--ev-accent, var(--color-gold));
  }

  .goal-target {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .goal-track {
    height: 6px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(12, 14, 23, 0.55);
  }

  .goal-band .goal-track {
    height: 4px;
  }

  .goal-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--ev-accent, var(--color-gold)), var(--ev-accent-2, var(--color-gold-light)));
  }

  .goal-unlock {
    justify-self: end;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .goal-unlock-reached {
    color: var(--ev-accent, var(--color-gold));
  }

  .goal-spark {
    margin-right: 6px;
    color: var(--ev-accent, var(--color-gold));
    font-size: 0.9em;
  }
</style>
