<script lang="ts">
  import { milestoneWindow } from "../goalMeter";
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
  const nextLocked = $derived(goal.milestones.find((milestone) => !reached(milestone.at)) ?? null);

  // A long ladder is summarized around the member's position instead of listed
  // in full; see milestoneWindow for why and where the threshold sits.
  const tiers = $derived(milestoneWindow(goal.milestones, reached));

  /** Milestones before the last one become ticks on the track. */
  const ticks = $derived(
    tiers.compact
      ? tiers.visible.filter((milestone) => milestone.at !== finalAt)
      : goal.milestones.slice(0, -1),
  );

  // The band strip always keeps its one-line summary; the style only shapes
  // the full-size meter.
  const style = $derived(goal.milestoneStyle ?? "list");
  const showMarkers = $derived(size === "full" && (style === "markers" || style === "both"));
  const showList = $derived(size === "full" && (style === "list" || style === "both"));

  /** Anchor markers and tooltips inward near the edges so nothing clips. */
  function anchor(at: number): "start" | "middle" | "end" {
    const percent = (at / finalAt) * 100;
    if (percent <= 10) return "start";
    if (percent >= 90) return "end";
    return "middle";
  }

  // A tap pins the tooltip open (hover does not exist on touch); blur,
  // Escape, or a second tap releases it.
  let pinned = $state<number | null>(null);
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
    aria-valuenow={shown === null ? undefined : Math.min(shown, finalAt)}
    aria-label="{goal.metricLabel} toward {goal.milestones.at(-1)?.unlock}"
  >
    <div class="goal-fill" style="width:{fraction * 100}%"></div>
    {#each ticks as milestone (milestone.at)}
      <div
        class="goal-tick"
        class:goal-tick-reached={reached(milestone.at)}
        style="left:{Math.min(100, (milestone.at / finalAt) * 100)}%"
        title={showMarkers ? undefined : `${milestone.unlock} at ${milestone.at.toLocaleString()}`}
      ></div>
    {/each}
  </div>
  {#if showMarkers}
    <div class="goal-waypoints">
      {#each tiers.visible as milestone (milestone.at)}
        <button
          type="button"
          class="goal-marker goal-marker-{anchor(milestone.at)}"
          class:goal-marker-reached={reached(milestone.at)}
          class:goal-marker-pinned={pinned === milestone.at}
          style="left:{Math.min(100, (milestone.at / finalAt) * 100)}%"
          aria-label="{milestone.unlock} at {milestone.at.toLocaleString()} {goal.metricLabel}"
          onclick={() => (pinned = pinned === milestone.at ? null : milestone.at)}
          onblur={() => (pinned = null)}
          onmouseleave={() => pinned === milestone.at && (pinned = null)}
          onkeydown={(event) => {
            // Blur too: the focus-visible tooltip is independent of the pin,
            // so Escape must actually dismiss what the keyboard user sees.
            if (event.key === "Escape") {
              pinned = null;
              event.currentTarget.blur();
            }
          }}
        >
          <span class="goal-node" aria-hidden="true"></span>
          <span class="goal-marker-label">{milestone.label ?? milestone.at.toLocaleString()}</span>
          <span class="goal-tip" aria-hidden="true">
            {milestone.unlock}
            <span class="goal-tip-at">{milestone.at.toLocaleString()}</span>
          </span>
        </button>
      {/each}
    </div>
  {/if}
  {#if size === "band" || (showList && goal.milestones.length === 1)}
    {@const last = goal.milestones.at(-1)}
    <div class="goal-unlock" class:goal-unlock-reached={nextLocked === null}>
      <span class="goal-spark" aria-hidden="true">✦</span>
      {#if nextLocked === null}
        {last?.unlock} unlocked
      {:else}
        {nextLocked.unlock} at {nextLocked.at.toLocaleString()}
      {/if}
    </div>
  {:else if showList}
    <ul class="goal-milestones">
      {#if tiers.hiddenBefore > 0}
        <li class="goal-unlock goal-unlock-rest">
          {tiers.hiddenBefore.toLocaleString()} earlier {tiers.hiddenBefore === 1 ? "tier" : "tiers"} unlocked
        </li>
      {/if}
      {#each tiers.visible as milestone (milestone.at)}
        <li class="goal-unlock" class:goal-unlock-reached={reached(milestone.at)}>
          <span class="goal-spark" aria-hidden="true">✦</span>
          {#if reached(milestone.at)}
            {milestone.unlock} unlocked
          {:else}
            {milestone.unlock} at {milestone.at.toLocaleString()}
          {/if}
        </li>
      {/each}
      {#if tiers.hiddenAfter > 0}
        <li class="goal-unlock goal-unlock-rest">
          {tiers.hiddenAfter.toLocaleString()} more {tiers.hiddenAfter === 1 ? "tier" : "tiers"}, up to
          {goal.milestones.at(-1)?.unlock} at {finalAt.toLocaleString()}
        </li>
      {/if}
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
    background: color-mix(in srgb, var(--color-abyss) 55%, transparent);
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

  /* ── Waypoint markers ─────────────────────────────────────────────── */

  .goal-waypoints {
    position: relative;
    height: 34px;
    margin-top: -4px;
  }

  .goal-marker {
    position: absolute;
    top: 0;
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    background: none;
    cursor: default;
    font: inherit;
  }

  .goal-marker-middle {
    transform: translateX(-50%);
  }

  .goal-marker-start {
    transform: translateX(-4px);
    justify-items: start;
  }

  .goal-marker-end {
    transform: translateX(calc(-100% + 4px));
    justify-items: end;
  }

  /* The waypoint node: the site's ✦ spark reduced to a solid diamond. */
  .goal-node {
    width: 7px;
    height: 7px;
    transform: rotate(45deg);
    border: 1px solid var(--ev-accent, var(--color-gold));
    background: transparent;
  }

  .goal-marker-reached .goal-node {
    background: var(--ev-accent, var(--color-gold));
  }

  .goal-marker-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .goal-marker-reached .goal-marker-label {
    color: var(--ev-accent, var(--color-gold));
  }

  .goal-marker:focus-visible {
    outline: none;
  }

  .goal-marker:focus-visible .goal-node {
    outline: 2px solid var(--ev-accent, var(--color-gold));
    outline-offset: 3px;
  }

  .goal-tip {
    position: absolute;
    bottom: calc(100% + 14px);
    z-index: 3;
    max-width: 240px;
    padding: 6px 10px;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-abyss) 94%, transparent);
    color: var(--text-body);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    line-height: 1.4;
    text-align: left;
    text-transform: none;
    letter-spacing: normal;
    white-space: normal;
    width: max-content;
    opacity: 0;
    visibility: hidden;
    transition: opacity 120ms ease;
    pointer-events: none;
  }

  .goal-marker-middle .goal-tip {
    left: 50%;
    transform: translateX(-50%);
  }

  .goal-marker-start .goal-tip {
    left: 0;
  }

  .goal-marker-end .goal-tip {
    right: 0;
  }

  .goal-tip-at {
    margin-left: 6px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .goal-marker:hover .goal-tip,
  .goal-marker:focus-visible .goal-tip,
  .goal-marker-pinned .goal-tip {
    opacity: 1;
    visibility: visible;
  }

  @media (prefers-reduced-motion: reduce) {
    .goal-tip {
      transition: none;
    }
  }

  /* ── Unlock list ──────────────────────────────────────────────────── */

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

  /* The summary rows are context, not tiers: no spark, and set as plain text
     rather than the list's uppercase. Kept at the muted colour rather than
     dimmed further, which would put it under the contrast floor. */
  .goal-unlock-rest {
    text-transform: none;
    letter-spacing: normal;
  }

  .goal-spark {
    margin-right: 6px;
    color: var(--ev-accent, var(--color-gold));
    font-size: 0.9em;
  }
</style>
