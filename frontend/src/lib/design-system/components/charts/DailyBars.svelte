<script lang="ts">
  import ChartTip from "./ChartTip.svelte";

  let {
    points,
    from,
    to,
    metricLabel,
    unit = "",
    height = 180,
    decimals = 0,
    caption = null,
  }: {
    /** Sparse day → value pairs; days inside [from, to] without a point count as zero. */
    points: { day: string; value: number }[];
    from: string;
    to: string;
    /** Row label in the hover card and table header, e.g. "Playtime". */
    metricLabel: string;
    /** Suffix appended to formatted values, e.g. " h". */
    unit?: string;
    height?: number;
    decimals?: number;
    caption?: string | null;
  } = $props();

  const GAP = 2;
  const AXIS = 18;
  /** Beyond this many days the chart buckets by week to keep bars readable. */
  const WEEKLY_THRESHOLD = 112;
  const DAY_MS = 24 * 60 * 60 * 1000;

  let width = $state(0);
  const plotHeight = $derived(height - AXIS);

  interface Bucket {
    /** First day of the bucket. */
    day: string;
    days: number;
    value: number;
  }

  const buckets: Bucket[] = $derived.by(() => {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    const dayCount = Math.round((end - start) / DAY_MS) + 1;
    const size = dayCount > WEEKLY_THRESHOLD ? 7 : 1;

    const byDay = new Map(points.map((point) => [point.day, point.value]));
    const result: Bucket[] = [];
    for (let offset = 0; offset < dayCount; offset += size) {
      const days = Math.min(size, dayCount - offset);
      let value = 0;
      for (let i = 0; i < days; i += 1) {
        value += byDay.get(isoDay(start + (offset + i) * DAY_MS)) ?? 0;
      }
      result.push({ day: isoDay(start + offset * DAY_MS), days, value });
    }
    return result;
  });

  const weekly = $derived(buckets.length > 0 && buckets[0].days > 1);

  interface Rendered extends Bucket {
    x: number;
    y: number;
    width: number;
    height: number;
    peak: boolean;
  }

  const rendered: Rendered[] = $derived.by(() => {
    if (width <= 0 || buckets.length === 0) return [];
    const max = Math.max(...buckets.map((bucket) => bucket.value));
    if (max <= 0) return [];
    const slot = width / buckets.length;
    const barWidth = Math.max(2, Math.min(28, Math.floor(slot - GAP)));
    return buckets.map((bucket, index) => {
      const barHeight =
        bucket.value <= 0 ? 1 : Math.max(2, Math.round((bucket.value / max) * (plotHeight - 12)));
      return {
        ...bucket,
        x: Math.round(index * slot + (slot - barWidth) / 2),
        y: plotHeight - barHeight,
        width: barWidth,
        height: barHeight,
        peak: bucket.value === max,
      };
    });
  });

  let hovered = $state<Rendered | null>(null);

  const axisStep = $derived(Math.max(1, Math.ceil(rendered.length / 7)));

  function isoDay(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function shortDay(day: string): string {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${day}T00:00:00Z`),
    );
  }

  function longDay(day: string): string {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${day}T00:00:00Z`));
  }

  function bucketTitle(bucket: Bucket): string {
    return bucket.days > 1 ? `Week of ${longDay(bucket.day)}` : longDay(bucket.day);
  }

  function formatValue(value: number): string {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: decimals })}${unit}`;
  }

  // The table is the chart's complete accessible form, so zero buckets stay:
  // a quiet day is data, not an absence of it.
  const newestFirst = $derived([...buckets].reverse());
  const period = $derived(weekly ? "week" : "day");
</script>

<figure class="daily">
  <div class="daily-plot" bind:clientWidth={width} style="height:{height}px">
    {#if rendered.length > 0}
      <svg
        {width}
        {height}
        shape-rendering="crispEdges"
        role="img"
        aria-label="{metricLabel} per {period}, {longDay(from)} to {longDay(to)}"
        onmouseleave={() => (hovered = null)}
      >
        {#each rendered as bucket (bucket.day)}
          <g
            class="daily-col"
            class:daily-col-peak={bucket.peak}
            class:daily-col-hovered={hovered === bucket}
            role="presentation"
            onmouseenter={() => (hovered = bucket)}
          >
            <rect class="daily-hit" x={bucket.x - GAP / 2} y="0" width={bucket.width + GAP} height={plotHeight} />
            <rect class="daily-bar" x={bucket.x} y={bucket.y} width={bucket.width} height={bucket.height} />
            {#if bucket.peak && bucket.value > 0}
              <rect class="daily-cap" x={bucket.x} y={bucket.y} width={bucket.width} height="3" />
            {/if}
          </g>
        {/each}
        {#each rendered as bucket, index (bucket.day)}
          {#if index % axisStep === 0 || index === rendered.length - 1}
            <text class="daily-axis" x={bucket.x + bucket.width / 2} y={height - 4} text-anchor="middle">
              {shortDay(bucket.day)}
            </text>
          {/if}
        {/each}
      </svg>
      {#if hovered}
        <ChartTip
          x={hovered.x + hovered.width / 2}
          plotWidth={width}
          title={bucketTitle(hovered)}
          rows={[{ label: metricLabel, value: formatValue(hovered.value) }]}
        />
      {/if}
    {:else if buckets.length > 0}
      <p class="daily-empty">Nothing recorded in this window.</p>
    {/if}
  </div>
  {#if caption}
    <figcaption class="daily-caption">{caption}</figcaption>
  {/if}
  {#if buckets.length > 0}
    <details class="daily-table">
      <summary>View as table</summary>
      <table>
        <caption>{metricLabel} per {period}, {longDay(from)} to {longDay(to)}</caption>
        <thead>
          <tr><th scope="col">{weekly ? "Week of" : "Day"}</th><th scope="col">{metricLabel}</th></tr>
        </thead>
        <tbody>
          {#each newestFirst as bucket (bucket.day)}
            <tr><th scope="row">{longDay(bucket.day)}</th><td>{formatValue(bucket.value)}</td></tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}
</figure>

<style>
  .daily {
    margin: 0;
  }

  .daily-plot {
    position: relative;
    width: 100%;
  }

  svg {
    display: block;
  }

  .daily-hit {
    fill: transparent;
  }

  .daily-bar {
    fill: var(--chart-context);
    transition: fill var(--dur-fast) ease;
  }

  .daily-col-peak .daily-bar {
    fill: var(--color-gold-dark);
  }

  .daily-cap {
    fill: var(--color-gold-light);
  }

  .daily-col-hovered .daily-bar {
    fill: var(--color-text-secondary);
  }

  .daily-col-peak.daily-col-hovered .daily-bar {
    fill: var(--color-gold);
  }

  .daily-axis {
    fill: var(--color-text-dim);
    font-family: var(--font-display);
    font-size: 0.625rem;
    letter-spacing: 0.04em;
  }

  .daily-empty {
    display: grid;
    place-content: center;
    height: 100%;
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .daily-caption {
    margin-top: 8px;
    color: var(--text-muted);
    font-size: var(--text-2xs);
  }

  .daily-table {
    margin-top: 8px;
  }

  .daily-table summary {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
  }

  .daily-table summary:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
    outline-offset: 2px;
  }

  .daily-table table {
    width: 100%;
    margin-top: 8px;
    border-collapse: collapse;
    font-size: var(--text-xs);
  }

  .daily-table th,
  .daily-table td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-border-subtle);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .daily-table th:first-child,
  .daily-table td:first-child {
    text-align: left;
  }

  .daily-table caption {
    padding: 0 8px 6px;
    color: var(--text-muted);
    font-size: var(--text-2xs);
    text-align: left;
  }

  .daily-table thead th {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-weight: var(--weight-regular);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .daily-table tbody th,
  .daily-table td {
    color: var(--text-body);
    font-weight: var(--weight-regular);
    font-family: var(--font-data);
  }
</style>
