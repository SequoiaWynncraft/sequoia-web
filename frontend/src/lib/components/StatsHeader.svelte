<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    kicker,
    title,
    lead,
    actions,
  }: {
    kicker: string;
    title: string;
    lead?: string;
    actions?: Snippet;
  } = $props();
</script>

<header class="stats-head animate-fade-in-up">
  <div class="stats-head-text">
    <span class="stats-head-kicker">{kicker}</span>
    <h1 class="stats-head-title text-gold-gradient">{title}</h1>
    {#if lead}<p class="stats-head-lead">{lead}</p>{/if}
  </div>
  {#if actions}
    <div class="stats-head-actions">{@render actions()}</div>
  {/if}
</header>

<style>
  .stats-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin: 4px 0 28px;
  }

  .stats-head-kicker {
    display: block;
    margin-bottom: 8px;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
  }

  .stats-head-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(1.6rem, 3vw, 2.2rem);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    text-transform: uppercase;
  }

  .stats-head-lead {
    margin: 10px 0 0;
    max-width: 60ch;
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .stats-head-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 4px;
  }

  @media (max-width: 700px) {
    .stats-head {
      flex-direction: column;
      align-items: stretch;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stats-head {
      animation: none;
    }
  }
</style>
