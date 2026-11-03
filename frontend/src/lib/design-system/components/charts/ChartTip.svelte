<script lang="ts">
  export interface ChartTipRow {
    label: string;
    value: string;
    mark?: string;
  }

  let {
    x,
    plotWidth,
    title,
    rows,
    total = null,
  }: {
    /** Anchor x in plot pixels; the tip clamps itself inside the plot. */
    x: number;
    plotWidth: number;
    title: string;
    rows: ChartTipRow[];
    total?: ChartTipRow | null;
  } = $props();

  const HALF = 84;
  const left = $derived(Math.min(Math.max(x, HALF), Math.max(plotWidth - HALF, HALF)));
</script>

<div class="chart-tip" style="left:{left}px" role="status">
  <span class="tip-title">{title}</span>
  {#each rows as row (row.label)}
    <span class="tip-row">
      <span>
        {#if row.mark}<span class="tip-mark" style="background:{row.mark}" aria-hidden="true"></span>{/if}
        {row.label}
      </span>
      <span>{row.value}</span>
    </span>
  {/each}
  {#if total}
    <span class="tip-row tip-total"><span>{total.label}</span><span>{total.value}</span></span>
  {/if}
  <span class="tip-caret" style="left:calc(50% + {x - left}px)" aria-hidden="true">◆</span>
</div>

<style>
  .chart-tip {
    position: absolute;
    bottom: calc(100% - 2px);
    transform: translateX(-50%);
    display: grid;
    gap: 3px;
    min-width: 156px;
    padding: 9px 11px 10px;
    border: 1px solid var(--color-border-accent);
    background: var(--color-deep);
    box-shadow: var(--shadow-md);
    pointer-events: none;
    z-index: var(--z-base);
    animation: tip-rise var(--dur-fast) ease;
  }

  @keyframes tip-rise {
    from {
      opacity: 0;
      translate: 0 3px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chart-tip {
      animation: none;
    }
  }

  .tip-title {
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .tip-row {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    color: var(--text-body);
    font-size: var(--text-2xs);
  }

  .tip-row > span:first-child {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
  }

  .tip-row > span:last-child {
    color: var(--text-heading);
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }

  .tip-mark {
    display: inline-block;
    width: 8px;
    height: 8px;
  }

  .tip-total {
    margin-top: 2px;
    padding-top: 5px;
    border-top: 1px solid var(--color-border-subtle);
  }

  .tip-caret {
    position: absolute;
    top: 100%;
    margin-top: -5px;
    transform: translateX(-50%);
    color: var(--color-border-accent);
    font-size: 9px;
    line-height: 1;
  }
</style>
