<script lang="ts">
  import ChartTip from "./ChartTip.svelte";

  export interface StackedSeries {
    key: string;
    label: string;
    color: string;
  }

  export interface StackedColumn {
    label: string;
    values: Record<string, number>;
  }

  let {
    series,
    columns,
    height = 200,
    unit = "",
  }: {
    series: StackedSeries[];
    columns: StackedColumn[];
    height?: number;
    unit?: string;
  } = $props();

  const GAP = 2;
  const AXIS = 18;
  let width = $state(0);
  const plotHeight = $derived(height - AXIS);

  interface Segment {
    key: string;
    color: string;
    y: number;
    height: number;
  }

  interface Rendered {
    label: string;
    total: number;
    values: Record<string, number>;
    x: number;
    width: number;
    segments: Segment[];
  }

  const rendered: Rendered[] = $derived.by(() => {
    if (width <= 0 || columns.length === 0) return [];
    const max = Math.max(...columns.map((column) => total(column)), 1);
    const slot = width / columns.length;
    const barWidth = Math.max(4, Math.min(28, Math.floor(slot - GAP * 2)));

    return columns.map((column, index) => {
      let cursor = plotHeight;
      const segments: Segment[] = [];
      for (const entry of series) {
        const value = column.values[entry.key] ?? 0;
        if (value <= 0) continue;
        const segmentHeight = Math.max(2, Math.round((value / max) * (plotHeight - 12)));
        cursor -= segmentHeight;
        segments.push({ key: entry.key, color: entry.color, y: cursor, height: segmentHeight });
        cursor -= GAP;
      }
      return {
        label: column.label,
        total: total(column),
        values: column.values,
        x: Math.round(index * slot + (slot - barWidth) / 2),
        width: barWidth,
        segments,
      };
    });
  });

  function total(column: StackedColumn): number {
    return series.reduce((sum, entry) => sum + (column.values[entry.key] ?? 0), 0);
  }

  let hovered = $state<Rendered | null>(null);

  const labelStep = $derived(rendered.length > 20 ? 5 : rendered.length > 10 ? 2 : 1);
</script>

<figure class="stacked">
  {#if series.length > 1}
    <div class="legend">
      {#each series as entry (entry.key)}
        <span class="legend-item">
          <span class="legend-mark" style="background:{entry.color}" aria-hidden="true"></span>
          {entry.label}
        </span>
      {/each}
    </div>
  {/if}

  <div class="plot" bind:clientWidth={width}>
    {#if rendered.length > 0}
      <svg {width} {height} shape-rendering="crispEdges" role="img" aria-label="Stacked column chart">
        {#each rendered as column (column.label)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <g
            class="column"
            tabindex="0"
            role="img"
            aria-label={`${column.label} - ${column.total.toLocaleString()}${unit}`}
            onmouseenter={() => (hovered = column)}
            onmouseleave={() => (hovered = null)}
            onfocus={() => (hovered = column)}
            onblur={() => (hovered = null)}
          >
            <rect class="hit" x={column.x - GAP} y="0" width={column.width + GAP * 2} height={plotHeight} />
            {#each column.segments as segment (segment.key)}
              <rect x={column.x} y={segment.y} width={column.width} height={segment.height} fill={segment.color} />
            {/each}
          </g>
        {/each}
        {#each rendered as column, index (column.label)}
          {#if index % labelStep === 0 || index === rendered.length - 1}
            <text class="axis" x={column.x + column.width / 2} y={height - 4} text-anchor="middle">
              {column.label}
            </text>
          {/if}
        {/each}
      </svg>
      {#if hovered}
        <ChartTip
          x={hovered.x + hovered.width / 2}
          plotWidth={width}
          title={hovered.label}
          rows={series
            .filter((entry) => (hovered?.values[entry.key] ?? 0) > 0)
            .map((entry) => ({
              label: entry.label,
              value: (hovered?.values[entry.key] ?? 0).toLocaleString(),
              mark: entry.color,
            }))}
          total={{ label: "Total", value: hovered.total.toLocaleString() + unit }}
        />
      {/if}
    {/if}
  </div>

  <details class="table-view">
    <summary>View as table</summary>
    <table>
      <thead>
        <tr>
          <th scope="col"></th>
          {#each series as entry (entry.key)}<th scope="col">{entry.label}</th>{/each}
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {#each columns as column (column.label)}
          <tr>
            <td>{column.label}</td>
            {#each series as entry (entry.key)}<td>{(column.values[entry.key] ?? 0).toLocaleString()}</td>{/each}
            <td>{total(column).toLocaleString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>
</figure>

<style>
  .stacked {
    margin: 0;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 10px;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-body);
    font-size: var(--text-2xs);
  }

  .legend-mark {
    display: inline-block;
    width: 9px;
    height: 9px;
  }

  .plot {
    position: relative;
    width: 100%;
  }

  svg {
    display: block;
  }

  .column {
    outline: none;
  }

  .hit {
    fill: transparent;
  }

  .column:focus-visible .hit {
    stroke: color-mix(in srgb, var(--color-gold) 50%, transparent);
    stroke-width: 2;
  }

  .axis {
    fill: var(--color-text-dim);
    font-family: var(--font-display);
    font-size: 0.625rem;
    letter-spacing: 0.04em;
  }

  .table-view {
    margin-top: 8px;
  }

  .table-view summary {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
  }

  .table-view summary:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
    outline-offset: 2px;
  }

  .table-view table {
    width: 100%;
    margin-top: 8px;
    border-collapse: collapse;
    font-size: var(--text-xs);
  }

  .table-view th,
  .table-view td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-border-subtle);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .table-view th:first-child,
  .table-view td:first-child {
    text-align: left;
  }

  .table-view th {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-weight: var(--weight-regular);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .table-view td {
    color: var(--text-body);
    font-family: var(--font-data);
  }
</style>
