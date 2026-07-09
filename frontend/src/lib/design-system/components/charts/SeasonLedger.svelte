<script lang="ts">
  import type { GuildSeasonRank } from "$lib/api/guildStats";

  interface LedgerColumn {
    season: number;
    rating: number;
    territories: number;
    position: number | null;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  let {
    seasons,
    positions = {},
    compact = false,
  }: {
    seasons: GuildSeasonRank[];
    /** Leaderboard slug → placement, e.g. { guildSeason31: 1 }. */
    positions?: Record<string, number>;
    compact?: boolean;
  } = $props();

  const GAP = 2;
  let width = $state(0);
  const axis = $derived(compact ? 14 : 18);
  const height = $derived(compact ? 132 : 224);
  const plotHeight = $derived(height - axis);

  const columns: LedgerColumn[] = $derived.by(() => {
    if (width <= 0 || seasons.length === 0) return [];
    const max = Math.max(...seasons.map((entry) => entry.rating), 1);
    const slot = width / seasons.length;
    const barWidth = Math.max(3, Math.floor(slot - GAP));
    return seasons.map((entry, index) => {
      const barHeight = Math.max(2, Math.round((entry.rating / max) * (plotHeight - 16)));
      return {
        season: entry.season,
        rating: entry.rating,
        territories: entry.final_territories,
        position: positions[`guildSeason${entry.season}`] ?? null,
        x: Math.round(index * slot + (slot - barWidth) / 2),
        y: plotHeight - barHeight,
        width: barWidth,
        height: barHeight,
      };
    });
  });

  let hovered = $state<LedgerColumn | null>(null);

  function labelStep(count: number): number {
    return count > 16 ? 4 : count > 8 ? 2 : 1;
  }

  const step = $derived(labelStep(columns.length));

  function columnLabel(column: LedgerColumn): string {
    const placement = column.position ? `, finished #${column.position}` : "";
    return `Season ${column.season} — ${column.rating.toLocaleString()} rating, ${column.territories} final territories${placement}`;
  }
</script>

<figure class="ledger" class:ledger-compact={compact}>
  <div class="ledger-plot" bind:clientWidth={width}>
    {#if columns.length > 0}
      <svg {width} {height} shape-rendering="crispEdges" role="img" aria-label="Season rating history">
        {#each columns as column (column.season)}
          {@const first = column.position === 1}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <g
            class="ledger-col"
            class:ledger-col-first={first}
            class:ledger-col-hovered={hovered === column}
            tabindex="0"
            role="img"
            aria-label={columnLabel(column)}
            onmouseenter={() => (hovered = column)}
            onmouseleave={() => (hovered = null)}
            onfocus={() => (hovered = column)}
            onblur={() => (hovered = null)}
          >
            <rect class="ledger-hit" x={column.x - GAP / 2} y="0" width={column.width + GAP} height={plotHeight} />
            <rect
              class="ledger-bar"
              x={column.x}
              y={column.y}
              width={column.width}
              height={column.height}
            />
            {#if first}
              <rect class="ledger-cap" x={column.x} y={column.y} width={column.width} height="3" />
            {/if}
            {#if !compact && column.position && column.width >= 18}
              <text
                class="ledger-place"
                class:ledger-place-first={first}
                x={column.x + column.width / 2}
                y={column.y - 6}
                text-anchor="middle"
              >
                #{column.position}
              </text>
            {/if}
          </g>
        {/each}
        {#each columns as column, index (column.season)}
          {#if index % step === 0 || index === columns.length - 1}
            <text class="ledger-axis" x={column.x + column.width / 2} y={height - 4} text-anchor="middle">
              {column.season}
            </text>
          {/if}
        {/each}
      </svg>
      {#if hovered}
        <div
          class="ledger-tip"
          style="left:{Math.min(Math.max(hovered.x + hovered.width / 2, 70), width - 70)}px"
          role="status"
        >
          <span class="tip-title">Season {hovered.season}{hovered.position ? ` · #${hovered.position}` : ""}</span>
          <span class="tip-row"><span>Rating</span><span>{hovered.rating.toLocaleString()}</span></span>
          <span class="tip-row"><span>Final territories</span><span>{hovered.territories}</span></span>
        </div>
      {/if}
    {/if}
  </div>
  {#if !compact}
    <figcaption class="ledger-caption">
      Guild season rating by season · gold marks a #1 finish
    </figcaption>
    <details class="ledger-table">
      <summary>View as table</summary>
      <table>
        <thead>
          <tr><th scope="col">Season</th><th scope="col">Rating</th><th scope="col">Final territories</th><th scope="col">Placement</th></tr>
        </thead>
        <tbody>
          {#each [...columns].reverse() as column (column.season)}
            <tr>
              <td>{column.season}</td>
              <td>{column.rating.toLocaleString()}</td>
              <td>{column.territories}</td>
              <td>{column.position ? `#${column.position}` : "—"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}
</figure>

<style>
  .ledger {
    margin: 0;
  }

  .ledger-plot {
    position: relative;
    width: 100%;
  }

  svg {
    display: block;
  }

  .ledger-col {
    outline: none;
  }

  .ledger-hit {
    fill: transparent;
  }

  .ledger-bar {
    fill: var(--chart-context);
    transition: fill var(--dur-fast) ease;
  }

  .ledger-col-first .ledger-bar {
    fill: var(--color-gold-dark);
  }

  .ledger-cap {
    fill: var(--color-gold-light);
  }

  .ledger-col-hovered .ledger-bar,
  .ledger-col:focus-visible .ledger-bar {
    fill: var(--color-text-secondary);
  }

  .ledger-col-first.ledger-col-hovered .ledger-bar,
  .ledger-col-first:focus-visible .ledger-bar {
    fill: var(--color-gold);
  }

  .ledger-col:focus-visible .ledger-hit {
    stroke: rgba(245, 197, 66, 0.5);
    stroke-width: 2;
  }

  .ledger-place {
    fill: var(--color-text-dim);
    font-family: var(--font-display);
    font-size: 0.55rem;
    letter-spacing: 0.04em;
  }

  .ledger-place-first {
    fill: var(--color-gold);
  }

  .ledger-axis {
    fill: var(--color-text-dim);
    font-family: var(--font-display);
    font-size: 0.55rem;
    letter-spacing: 0.04em;
  }

  .ledger-tip {
    position: absolute;
    bottom: calc(100% - 4px);
    transform: translateX(-50%);
    display: grid;
    gap: 3px;
    min-width: 148px;
    padding: 8px 10px;
    border: 1px solid var(--color-border-accent);
    background: var(--color-deep);
    box-shadow: var(--shadow-md);
    pointer-events: none;
    z-index: var(--z-base);
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
    gap: 12px;
    color: var(--text-body);
    font-size: var(--text-2xs);
  }

  .tip-row span:last-child {
    color: var(--text-heading);
    font-family: var(--font-data);
  }

  .ledger-caption {
    margin-top: 8px;
    color: var(--text-muted);
    font-size: var(--text-2xs);
  }

  .ledger-table {
    margin-top: 8px;
  }

  .ledger-table summary {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
  }

  .ledger-table summary:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .ledger-table table {
    width: 100%;
    margin-top: 8px;
    border-collapse: collapse;
    font-size: var(--text-xs);
  }

  .ledger-table th,
  .ledger-table td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-border-subtle);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .ledger-table th:first-child,
  .ledger-table td:first-child {
    text-align: left;
  }

  .ledger-table th {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-weight: var(--weight-regular);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .ledger-table td {
    color: var(--text-body);
    font-family: var(--font-data);
  }
</style>
