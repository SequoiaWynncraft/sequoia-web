<script lang="ts">
  import ChartTip from "./ChartTip.svelte";
  import type { GuildSeasonRank } from "#lib/api/guildStats.js";

  interface LedgerColumn {
    season: number;
    rating: number;
    territories: number;
    position: number | null;
    live: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  let {
    seasons,
    positions = {},
    compact = false,
    liveSeason = null,
  }: {
    seasons: GuildSeasonRank[];
    /** Leaderboard slug → placement, e.g. { guildSeason31: 1 }. */
    positions?: Record<string, number>;
    compact?: boolean;
    /** Season still in progress — shown as a standing, not a finish. */
    liveSeason?: number | null;
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
        live: entry.season === liveSeason,
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

  function positionFor(season: number): number | null {
    return positions[`guildSeason${season}`] ?? null;
  }

  function columnLabel(column: LedgerColumn): string {
    if (column.live) {
      const standing = column.position ? `, currently #${column.position}` : "";
      return `Season ${column.season} (in progress) - ${column.rating.toLocaleString()} rating${standing}`;
    }
    const placement = column.position ? `, finished #${column.position}` : "";
    return `Season ${column.season} - ${column.rating.toLocaleString()} rating, ${column.territories} final territories${placement}`;
  }
</script>

<figure class="ledger" class:ledger-compact={compact}>
  <div class="ledger-plot" bind:clientWidth={width}>
    {#if columns.length > 0}
      <svg {width} {height} shape-rendering="crispEdges" role="img" aria-label="Season rating history">
        {#each columns as column (column.season)}
          {@const first = column.position === 1}
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
            {#if first && !column.live}
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
        <ChartTip
          x={hovered.x + hovered.width / 2}
          plotWidth={width}
          title="Season {hovered.season}{hovered.position ? ` · #${hovered.position}` : ''}{hovered.live
            ? ' · live'
            : ''}"
          rows={hovered.live
            ? [{ label: "Rating", value: hovered.rating.toLocaleString() }]
            : [
                { label: "Rating", value: hovered.rating.toLocaleString() },
                { label: "Final territories", value: hovered.territories.toLocaleString() },
              ]}
        />
      {/if}
    {/if}
  </div>
  {#if !compact}
    <figcaption class="ledger-caption">
      Guild season rating by season · gold marks a #1 placement{liveSeason !== null
        ? ` · season ${liveSeason} is in progress`
        : ""}
    </figcaption>
    <details class="ledger-table">
      <summary>View as table</summary>
      <table>
        <thead>
          <tr><th scope="col">Season</th><th scope="col">Rating</th><th scope="col">Final territories</th><th scope="col">Placement</th></tr>
        </thead>
        <tbody>
          {#each [...seasons].reverse() as entry (entry.season)}
            {@const live = entry.season === liveSeason}
            <tr>
              <td>{entry.season}</td>
              <td>{entry.rating.toLocaleString()}</td>
              <td>{live ? "-" : entry.final_territories}</td>
              <td>{positionFor(entry.season) ? `#${positionFor(entry.season)}${live ? " (live)" : ""}` : "-"}</td>
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
    stroke: color-mix(in srgb, var(--color-gold) 50%, transparent);
    stroke-width: 2;
  }

  .ledger-place {
    fill: var(--color-text-dim);
    font-family: var(--font-display);
    font-size: 0.625rem;
    letter-spacing: 0.04em;
  }

  .ledger-place-first {
    fill: var(--color-gold);
  }

  .ledger-axis {
    fill: var(--color-text-dim);
    font-family: var(--font-display);
    font-size: 0.625rem;
    letter-spacing: 0.04em;
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
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
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
