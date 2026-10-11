<script lang="ts">
  import {
    achievementCurrent, achievementEarned, achievementFraction, achievementGroups, achievementHistory, achievementNext, achievementValue,
    type AchievementProgress,
  } from "./progress";

  let { progress }: { progress: AchievementProgress } = $props();

  const groups = $derived(achievementGroups(progress.categories));
  const history = $derived(achievementHistory(progress.history));
</script>

<div class="achievements">
  {#if !progress.eligible}
    <p class="note" role="status">Not a current Sequoia member.</p>
  {/if}

  {#each groups as group (group.kind)}
    <section class="group" aria-labelledby={`group-${group.kind}`}>
      <h2 id={`group-${group.kind}`}>{group.label}</h2>
      <ul class="rows">
        {#each group.categories as category (category.key)}
          {@const fraction = achievementFraction(category)}
          {@const next = achievementNext(category)}
          <li class="row" class:unknown={category.unknown}>
            <span class="label">{category.label}</span>
            <span class="tier" class:none={!category.tier_label}>{achievementCurrent(category)}</span>
            <span class="value">{achievementValue(category)}</span>
            <span class="bar" aria-hidden="true"><span style:width={`${Math.round((fraction ?? 0) * 100)}%`}></span></span>
            <span class="next">{next}</span>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <p class="note">No achievement categories yet.</p>
  {/each}

  <section class="group" aria-labelledby="group-history">
    <h2 id="group-history">Earned</h2>
    {#if history.length > 0}
      <ol class="history">
        {#each history as award, index (award.award_id ?? `${award.key}:${award.label}:${index}`)}
          <li>
            <span class="label">{award.label}</span>
            {#if award.earned_at}
              <time datetime={award.earned_at}>{achievementEarned(award)}</time>
            {:else}
              <span class="recorded">{achievementEarned(award)}</span>
            {/if}
          </li>
        {/each}
      </ol>
    {:else}
      <p class="note">Nothing earned yet.</p>
    {/if}
  </section>
</div>

<style>
  .achievements { display: grid; gap: 28px; }
  .group { display: grid; gap: 8px; min-width: 0; }
  h2 { margin: 0; color: var(--text-heading); font-weight: var(--weight-regular); font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .note { margin: 0; color: var(--text-body); font-size: var(--text-sm); }
  ul, ol { list-style: none; margin: 0; padding: 0; }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr) 88px minmax(80px, 1fr) minmax(0, 1.3fr);
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-top: 1px solid var(--border-default);
    font-size: var(--text-sm);
  }
  .label { color: var(--text-heading); overflow-wrap: anywhere; }
  .tier { color: var(--color-gold); }
  .tier.none, .unknown .value, .recorded { color: var(--text-muted); }
  .value { color: var(--text-body); text-align: right; font-variant-numeric: tabular-nums; }
  .bar { position: relative; height: 6px; background: var(--color-surface); overflow: hidden; }
  .bar span { position: absolute; inset: 0 auto 0 0; background: var(--color-gold); }
  .next { color: var(--text-body); font-size: var(--text-xs); }
  .history li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; border-top: 1px solid var(--border-default); font-size: var(--text-sm); }
  .history time { color: var(--text-body); font-variant-numeric: tabular-nums; white-space: nowrap; }
  @media (max-width: 640px) {
    .row { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; }
    .tier { text-align: right; }
    .value { text-align: left; }
    .bar { grid-column: 1 / -1; grid-row: 3; }
    .next { text-align: right; }
  }
</style>
