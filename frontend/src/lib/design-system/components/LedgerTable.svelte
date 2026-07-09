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
  }: {
    columns: LedgerColumn<Row>[];
    rows: Row[];
    rowKey: (row: Row) => string;
    defaultSort: string;
    defaultDescending?: boolean;
    showRank?: boolean;
    highlight?: (row: Row) => boolean;
    maxHeight?: string;
  } = $props();

  // svelte-ignore state_referenced_locally — props intentionally seed the initial sort only
  let sortKey = $state(defaultSort);
  // svelte-ignore state_referenced_locally
  let descending = $state(defaultDescending);

  const sorted = $derived.by(() => {
    const column = columns.find((candidate) => candidate.key === sortKey) ?? columns[0];
    const direction = descending ? -1 : 1;
    return rows.toSorted((a, b) => {
      const left = sortRank(column, a);
      const right = sortRank(column, b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      if (typeof left === "number" && typeof right === "number") return (left - right) * direction;
      return String(left).localeCompare(String(right)) * direction;
    });
  });

  function sortRank(column: LedgerColumn<Row>, row: Row): number | string | null {
    return column.sortValue ? column.sortValue(row) : column.value(row);
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
</script>

<div class="ledger-scroll" style={maxHeight ? `max-height:${maxHeight}` : ""}>
  <table>
    <thead>
      <tr>
        {#if showRank}<th scope="col" class="rank-head">#</th>{/if}
        {#each columns as column (column.key)}
          <th scope="col" class:numeric={column.numeric} aria-sort={ariaSort(column)}>
            {#if column.sortable === false}
              <span class="head-label">{column.label}</span>
            {:else}
              <button class="head-sort" onclick={() => toggleSort(column)}>
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
      {#each sorted as row, index (rowKey(row))}
        <tr class="seq-row" class:highlight={highlight?.(row) === true}>
          {#if showRank}<td class="rank-cell">{index + 1}</td>{/if}
          {#each columns as column (column.key)}
            {@const mark = column.color?.(row) ?? null}
            {@const link = column.href?.(row) ?? null}
            {@const secondary = column.secondary?.(row) ?? null}
            <td class:numeric={column.numeric}>
              {#if mark}<span class="mark" style="background:{mark}" aria-hidden="true"></span>{/if}
              {#if link}
                <a href={link} class="cell-link">{column.value(row)}</a>
              {:else}
                {column.value(row)}
              {/if}
              {#if secondary}<span class="secondary">{secondary}</span>{/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

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
    outline: 2px solid rgba(245, 197, 66, 0.5);
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
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .rank-cell {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  tr.highlight td {
    background: rgba(245, 197, 66, 0.07);
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

  .cell-link {
    color: var(--text-heading);
    text-decoration: none;
  }

  .cell-link:hover {
    color: var(--color-gold-light);
  }

  .cell-link:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .secondary {
    margin-left: 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
