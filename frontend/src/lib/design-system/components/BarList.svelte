<script lang="ts">
  export interface BarListItem {
    label: string;
    value: number;
    color?: string;
    href?: string;
  }

  let {
    items,
    unit = "",
  }: {
    items: BarListItem[];
    unit?: string;
  } = $props();

  const max = $derived(Math.max(...items.map((item) => item.value), 1));
</script>

<div class="bar-list">
  {#each items as item (item.label)}
    <div class="bar-row">
      {#if item.href}
        <a class="bar-label bar-label-link" href={item.href}>{item.label}</a>
      {:else}
        <span class="bar-label">{item.label}</span>
      {/if}
      <span class="bar-track">
        <span
          class="bar-fill"
          style="width:{Math.max(0.5, (item.value / max) * 100)}%;background:{item.color ?? 'var(--chart-context)'}"
        ></span>
      </span>
      <span class="bar-value">{item.value.toLocaleString()}{unit}</span>
    </div>
  {/each}
</div>

<style>
  .bar-list {
    display: grid;
    gap: 8px;
  }

  .bar-row {
    display: grid;
    grid-template-columns: minmax(120px, 220px) minmax(0, 1fr) 90px;
    gap: 14px;
    align-items: center;
  }

  .bar-label {
    color: var(--text-body);
    font-size: var(--text-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bar-label-link {
    text-decoration: none;
  }

  .bar-label-link:hover {
    color: var(--color-gold-light);
  }

  .bar-label-link:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .bar-track {
    display: block;
    height: 12px;
    background: rgba(255, 255, 255, 0.04);
    box-shadow: var(--bevel-slot);
  }

  .bar-fill {
    display: block;
    height: 100%;
  }

  .bar-value {
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  @media (max-width: 560px) {
    .bar-row {
      grid-template-columns: minmax(90px, 130px) minmax(0, 1fr) 76px;
      gap: 8px;
    }
  }
</style>
