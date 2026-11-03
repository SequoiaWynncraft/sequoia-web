<script lang="ts" generics="Row">
  import type { LedgerColumn } from "./ledgerTable";

  let {
    columns,
    rows,
    rowKey,
    defaultSort,
    defaultDescending = true,
    showRank = true,
    highlight,
    maxHeight,
    sortKey = $bindable(defaultSort),
  }: {
    columns: LedgerColumn<Row>[];
    rows: Row[];
    rowKey: (row: Row) => string;
    defaultSort: string;
    defaultDescending?: boolean;
    showRank?: boolean;
    highlight?: (row: Row) => boolean;
    maxHeight?: string;
    sortKey?: string;
  } = $props();

  let descending = $state(defaultDescending);

  const sorted = $derived.by(() => {
    const column = columns.find((candidate) => candidate.key === sortKey) ?? columns[0];
    return orderRows(column, descending);
  });

  const ranks = $derived.by(() => {
    const column = columns.find((candidate) => candidate.key === defaultSort) ?? columns[0];
    return new Map(orderRows(column, defaultDescending).map((row, index) => [rowKey(row), index + 1]));
  });

  function orderRows(column: LedgerColumn<Row>, direction: boolean): Row[] {
    const factor = direction ? -1 : 1;
    return rows.toSorted((a, b) => {
      const left = sortRank(column, a);
      const right = sortRank(column, b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }

  function sortRank(column: LedgerColumn<Row>, row: Row): number | string | null {
    if (column.sortValue) return column.sortValue(row);
    return column.value ? column.value(row) : null;
  }

  function toggleSort(column: LedgerColumn<Row>) {
    if (column.sortable === false) return;
    if (sortKey === column.key) {
      descending = !descending;
    } else {
      sortKey = column.key;
      descending = true;
    }
  }

  function ariaSort(column: LedgerColumn<Row>): "ascending" | "descending" | undefined {
    if (sortKey !== column.key) return undefined;
    return descending ? "descending" : "ascending";
  }

  const TIP_DELAY_MS = 120;

  let tip = $state<{ text: string; x: number; y: number } | null>(null);
  let tipTimer: ReturnType<typeof setTimeout> | undefined;

  function hideTip() {
    clearTimeout(tipTimer);
    tip = null;
  }

  function tooltip(node: HTMLElement, text: string | null) {
    let label = text;

    const show = () => {
      clearTimeout(tipTimer);
      if (!label) return;
      const shown = label;
      tipTimer = setTimeout(() => {
        const rect = node.getBoundingClientRect();
        tip = { text: shown, x: rect.left + rect.width / 2, y: rect.top };
      }, TIP_DELAY_MS);
    };

    node.addEventListener("mouseenter", show);
    node.addEventListener("focus", show);
    node.addEventListener("mouseleave", hideTip);
    node.addEventListener("blur", hideTip);

    return {
      update(next: string | null) {
        label = next;
      },
      destroy() {
        node.removeEventListener("mouseenter", show);
        node.removeEventListener("focus", show);
        node.removeEventListener("mouseleave", hideTip);
        node.removeEventListener("blur", hideTip);
        hideTip();
      },
    };
  }
</script>

<svelte:window on:scroll={hideTip} on:resize={hideTip} />

<div class="ledger-scroll" style={maxHeight ? `max-height:${maxHeight}` : ""} onscroll={hideTip}>
  <table>
    <thead>
      <tr>
        {#if showRank}<th scope="col" class="rank-head">#</th>{/if}
        {#each columns as column (column.key)}
          <th scope="col" class:numeric={column.numeric} aria-sort={ariaSort(column)}>
            {#if column.sortable === false}
              <span class="head-label">
                {#if column.headerColor}<span class="mark" style="background:{column.headerColor}" aria-hidden="true"></span>{/if}
                {column.label}
              </span>
            {:else}
              <button class="head-sort" onclick={() => toggleSort(column)}>
                {#if column.headerColor}<span class="mark" style="background:{column.headerColor}" aria-hidden="true"></span>{/if}
                {column.label}
                <span class="sort-arrow" class:sort-active={sortKey === column.key} aria-hidden="true">
                  {sortKey === column.key ? (descending ? "▼" : "▲") : "▹"}
                </span>
              </button>
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each sorted as row (rowKey(row))}
        <tr class="seq-row" class:highlight={highlight?.(row) === true}>
          {#if showRank}<td class="rank-cell">{ranks.get(rowKey(row))}</td>{/if}
          {#each columns as column (column.key)}
            {@const mark = column.color?.(row) ?? null}
            {@const link = column.href?.(row) ?? null}
            {@const valueColor = column.valueColor?.(row) ?? null}
            {@const secondary = column.secondary?.(row) ?? null}
            {@const secondaryColor = column.secondaryColor?.(row) ?? null}
            {@const avatar = column.avatar?.(row) ?? null}
            {@const avatarAlt = column.avatarAlt?.(row) ?? null}
            {@const icon = column.icon?.(row) ?? null}
            <td class:numeric={column.numeric} class:name-cell={column.nameStyle}>
              {#if column.cell}
                {@render column.cell(row)}
              {:else}
                {#if avatar}
                  <span
                    class="tip-anchor"
                    role={avatarAlt ? "img" : undefined}
                    aria-label={avatarAlt ?? undefined}
                    tabindex={avatarAlt ? 0 : undefined}
                    use:tooltip={avatarAlt}
                  >
                    <img class="avatar" src={avatar} alt="" loading="lazy" width="22" height="22" />
                  </span>
                {/if}
                {#if mark}<span class="mark" style="background:{mark}" aria-hidden="true"></span>{/if}
                {#if link}
                  <a href={link} class="cell-link" style:color={valueColor ?? undefined}
                    >{column.value?.(row)}</a
                  >
                {:else}
                  <span style:color={valueColor ?? undefined}>{column.value?.(row)}</span>
                {/if}
                {#if secondary}<span
                    class="secondary"
                    style={secondaryColor ? `color:${secondaryColor}` : undefined}>{secondary}</span
                  >{/if}
                {#if icon}
                  <span
                    class="tip-anchor"
                    role={icon.alt ? "img" : undefined}
                    aria-label={icon.alt || undefined}
                    tabindex={icon.alt ? 0 : undefined}
                    use:tooltip={icon.alt}
                  >
                    <img class="cell-icon" src={icon.src} alt="" loading="lazy" width="16" height="16" />
                  </span>
                {/if}
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if tip}
  <div class="seq-tip" style="left:{tip.x}px; top:{tip.y}px" aria-hidden="true">{tip.text}</div>
{/if}

<style>
  .ledger-scroll {
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0;
    background: var(--color-abyss);
    border-bottom: 1px solid var(--color-border-accent);
    text-align: left;
  }

  thead th.numeric {
    text-align: right;
  }

  .head-label,
  .head-sort {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 9px 10px;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .head-sort {
    border: 0;
    background: none;
    cursor: pointer;
    transition: color var(--dur-fast) ease;
  }

  .head-sort:hover {
    color: var(--text-heading);
  }

  .head-sort:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
    outline-offset: -2px;
  }

  .sort-arrow {
    font-size: 0.6rem;
    color: var(--text-muted);
  }

  .sort-active {
    color: var(--color-gold);
  }

  .rank-head {
    width: 44px;
    padding: 9px 10px;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    font-weight: var(--weight-regular);
  }

  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border-subtle);
    color: var(--text-heading);
    font-size: var(--text-sm);
  }

  td.numeric {
    text-align: right;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }

  .rank-cell {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  tr.highlight td {
    background: color-mix(in srgb, var(--color-gold) 7%, transparent);
    color: var(--color-gold-light);
  }

  tr.highlight .rank-cell,
  tr.highlight .cell-link {
    color: var(--color-gold);
  }

  .mark {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 8px;
    vertical-align: 1px;
  }

  .avatar {
    margin-right: 10px;
    vertical-align: -5px;
    image-rendering: pixelated;
  }

  .tip-anchor {
    display: inline-block;
  }

  .tip-anchor:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
    outline-offset: 2px;
  }

  .seq-tip {
    position: fixed;
    z-index: 3;
    transform: translate(-50%, calc(-100% - 6px));
    padding: 4px 8px;
    border: 1px solid var(--color-border-subtle);
    background: var(--color-abyss);
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
    pointer-events: none;
  }

  .cell-icon {
    margin-left: 8px;
    vertical-align: -3px;
    image-rendering: pixelated;
  }

  td.name-cell {
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
  }

  td.name-cell .secondary {
    font-size: var(--text-xs);
  }

  .cell-link {
    color: var(--text-heading);
    text-decoration: none;
  }

  .cell-link:hover {
    color: var(--color-gold-light);
  }

  .cell-link:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
    outline-offset: 2px;
  }

  .secondary {
    margin-left: 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
