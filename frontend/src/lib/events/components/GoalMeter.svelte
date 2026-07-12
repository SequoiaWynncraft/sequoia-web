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

  const finalAt = $derived(goal.milestones.at(-1)?.at ?? 1);
  const shown = $derived(current ?? goal.finalTotal ?? null);
  const fraction = $derived(shown === null ? 0 : Math.min(1, shown / finalAt));
  const reached = $derived((at: number) => shown !== null && shown >= at);
  /** Milestones before the last one become ticks on the track. */
  const ticks = $derived(goal.milestones.slice(0, -1));
  const nextLocked = $derived(goal.milestones.find((milestone) => !reached(milestone.at)) ?? null);
</script>

<div class="goal goal-{size}">
  {#if size === "full"}
    <div class="goal-figures">
      <span class="goal-current" class:goal-current-unlocked={reached(finalAt)}>
        {shown === null ? "-" : shown.toLocaleString()}
      </span>
      <span class="goal-target">of {finalAt.toLocaleString()} {goal.metricLabel}</span>
    </div>
  {/if}
  <div
    class="goal-track"
    role="meter"
    aria-valuemin={0}
    aria-valuemax={finalAt}
    aria-valuenow={Math.min(shown ?? 0, finalAt)}
    aria-label="{goal.metricLabel} toward {goal.milestones.at(-1)?.unlock}"
  >
    <div class="goal-fill" style="width:{fraction * 100}%"></div>
    {#each ticks as milestone (milestone.at)}
      <div
        class="goal-tick"
        class:goal-tick-reached={reached(milestone.at)}
        style="left:{Math.min(100, (milestone.at / finalAt) * 100)}%"
        title="{milestone.unlock} at {milestone.at.toLocaleString()}"
      ></div>
    {/each}
  </div>
  {#if size === "band" || goal.milestones.length === 1}
    {@const last = goal.milestones.at(-1)}
    <div class="goal-unlock" class:goal-unlock-reached={nextLocked === null}>
      <span class="goal-spark" aria-hidden="true">✦</span>
      {#if nextLocked === null}
        {last?.unlock} unlocked
      {:else}
        {nextLocked.unlock} at {nextLocked.at.toLocaleString()}
      {/if}
    </div>
  {:else}
    <ul class="goal-milestones">
      {#each goal.milestones as milestone (milestone.at)}
        <li class="goal-unlock" class:goal-unlock-reached={reached(milestone.at)}>
          <span class="goal-spark" aria-hidden="true">✦</span>
          {#if reached(milestone.at)}
            {milestone.unlock} unlocked
          {:else}
            {milestone.unlock} at {milestone.at.toLocaleString()}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
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
    position: relative;
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

  .goal-tick {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    background: var(--color-border-accent);
  }

  .goal-tick-reached {
    background: var(--ev-accent, var(--color-gold));
  }

  .goal-milestones {
    display: grid;
    gap: 4px;
    justify-items: end;
    margin: 0;
    padding: 0;
    list-style: none;
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
