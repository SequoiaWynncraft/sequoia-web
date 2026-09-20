<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import ScopeChips from "$lib/design-system/components/ScopeChips.svelte";
  import { DIRECTORY_SORTS, type GlobalDirectoryEntry } from "$lib/api/globalDirectory";
  import type { GuildSearchHit } from "$lib/server/globalGuild";

  let { data } = $props();

  const query = $derived(data.query);
  const hits = $derived(data.hits);
  const directory = $derived(data.directory);
  const activeSort = $derived(data.sort);
  const page = $derived(data.page);

  const lastPage = $derived(
    directory && directory.size > 0 ? Math.max(0, Math.ceil(directory.total / directory.size) - 1) : 0,
  );
  // Stale links can point past the end; every pager target clamps to reality.
  const currentPage = $derived(Math.min(page, lastPage));

  function directoryHref(sort: string, targetPage: number): string {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (sort !== "members") params.set("sort", sort);
    if (targetPage > 0) params.set("page", String(targetPage));
    const suffix = params.toString();
    return suffix ? `?${suffix}` : "?";
  }

  function guildHref(name: string): string {
    return `/statistics/global/guilds/${encodeURIComponent(name)}`;
  }

  const searchColumns: LedgerColumn<GuildSearchHit>[] = [
    {
      key: "guild",
      label: "Guild",
      nameStyle: true,
      value: (hit) => hit.name,
      sortValue: (hit) => hit.name.toLowerCase(),
      secondary: (hit) => (hit.prefix ? `[${hit.prefix}]` : null),
      href: (hit) => guildHref(hit.name),
    },
    {
      key: "prefix",
      label: "Prefix",
      value: (hit) => hit.prefix || "-",
      sortValue: (hit) => hit.prefix.toLowerCase(),
    },
  ];

  const directoryColumns: LedgerColumn<GlobalDirectoryEntry>[] = $derived.by(() => [
    {
      key: "position",
      label: "#",
      numeric: true,
      sortable: false,
      value: (entry) => String(positionOf(entry)),
      sortValue: (entry) => positionOf(entry),
    },
    {
      key: "guild",
      label: "Guild",
      nameStyle: true,
      sortable: false,
      value: (entry) => entry.name,
      sortValue: (entry) => entry.name.toLowerCase(),
      secondary: (entry) => (entry.prefix ? `[${entry.prefix}]` : null),
      href: (entry) => guildHref(entry.name),
    },
    {
      key: "members",
      label: "Tracked members",
      numeric: true,
      sortable: false,
      value: (entry) => entry.members_tracked.toLocaleString(),
      sortValue: (entry) => entry.members_tracked,
    },
    {
      key: "online",
      label: "Online",
      numeric: true,
      sortable: false,
      value: (entry) => entry.online_now.toLocaleString(),
      sortValue: (entry) => entry.online_now,
    },
    {
      key: "active",
      label: "Active 7d",
      numeric: true,
      sortable: false,
      value: (entry) => entry.active_7d.toLocaleString(),
      sortValue: (entry) => entry.active_7d,
    },
    {
      key: "raids7d",
      label: "Raids 7d",
      numeric: true,
      sortable: false,
      value: (entry) => `+${entry.raids_7d.toLocaleString()}`,
      sortValue: (entry) => entry.raids_7d,
    },
    {
      key: "raids30d",
      label: "Raids 30d",
      numeric: true,
      sortable: false,
      value: (entry) => `+${entry.raids_30d.toLocaleString()}`,
      sortValue: (entry) => entry.raids_30d,
    },
  ]);

  function positionOf(entry: GlobalDirectoryEntry): number {
    if (!directory) return 0;
    return directory.page * directory.size + directory.entries.indexOf(entry) + 1;
  }
</script>

<StatsHeader kicker="Global" title="Guilds" lead="Look up any guild - or browse everything we track." />

<form class="lookup" method="GET" action="/statistics/global/guilds">
  <input
    type="search"
    name="q"
    value={query}
    placeholder="Guild name or prefix"
    maxlength="64"
    aria-label="Guild name or prefix"
  />
  <button type="submit">Search</button>
</form>

{#if query.length >= 3}
  <section class="block" aria-label="Search results">
    <SectionLabel meta={hits ? `${hits.length} match${hits.length === 1 ? "" : "es"}` : undefined}>
      {#snippet children()}Results{/snippet}
    </SectionLabel>
    {#if hits === null}
      <p class="muted">Search is temporarily unavailable - try again shortly.</p>
    {:else if hits.length === 0}
      <p class="muted">No guilds match "{query}".</p>
    {:else}
      <LedgerTable
        columns={searchColumns}
        rows={hits}
        rowKey={(hit) => hit.name}
        defaultSort="guild"
        defaultDescending={false}
        showRank={false}
        maxHeight="480px"
      />
    {/if}
  </section>
{/if}

<section class="block" aria-label="Guild directory">
  <SectionLabel
    meta={directory
      ? `${directory.total.toLocaleString()} guild${directory.total === 1 ? "" : "s"}${query ? ` matching "${query}"` : ""}`
      : undefined}
  >
    {#snippet children()}Directory{/snippet}
    {#snippet actions()}
      <ScopeChips
        scopes={[...DIRECTORY_SORTS]}
        active={activeSort}
        href={(key) => directoryHref(key, 0)}
        label="Sort order"
      />
    {/snippet}
  </SectionLabel>
  {#if directory && directory.warming_up}
    <p class="muted">The directory is warming up - check back in a few minutes.</p>
  {:else if directory && directory.entries.length > 0}
    <LedgerTable
      columns={directoryColumns}
      rows={directory.entries}
      rowKey={(entry) => entry.guild_uuid}
      defaultSort="position"
      defaultDescending={false}
      showRank={false}
      maxHeight="640px"
    />
    {#if lastPage > 0}
      <nav class="pager" aria-label="Directory pages">
        {#if currentPage > 0}
          <a href={directoryHref(activeSort, currentPage - 1)}>← Previous</a>
        {:else}
          <span class="pager-gap"></span>
        {/if}
        <span class="pager-status">Page {currentPage + 1} of {lastPage + 1}</span>
        {#if currentPage < lastPage}
          <a href={directoryHref(activeSort, currentPage + 1)}>Next →</a>
        {:else}
          <span class="pager-gap"></span>
        {/if}
      </nav>
    {/if}
  {:else if directory && directory.total > 0}
    <p class="muted">
      This page is past the end - <a class="pager-reset" href={directoryHref(activeSort, 0)}>back to the first page</a>.
    </p>
  {:else if directory}
    <p class="muted">No guilds match{query ? ` "${query}"` : ""}.</p>
  {:else}
    <p class="muted">The directory is temporarily unavailable.</p>
  {/if}
</section>

<style>
  .lookup {
    display: flex;
    gap: 10px;
    margin-bottom: 40px;
    max-width: 460px;
  }

  .lookup input {
    flex: 1;
    padding: 9px 12px;
    border: 1px solid var(--color-border-accent);
    background: var(--color-surface);
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-sm);
  }

  .lookup input:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
    outline-offset: 2px;
  }

  .lookup button {
    padding: 9px 18px;
    border: 1px solid var(--color-border-accent);
    background: none;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
    transition:
      color var(--dur-fast) ease,
      border-color var(--dur-fast) ease;
  }

  .lookup button:hover {
    border-color: color-mix(in srgb, var(--color-gold) 40%, transparent);
    color: var(--color-gold);
  }

  .lookup button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
    outline-offset: 2px;
  }

  .block {
    margin-bottom: 40px;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .pager {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-top: 14px;
  }

  .pager a {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    text-decoration: none;
  }

  .pager a:hover {
    color: var(--color-gold);
  }

  .pager a:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
    outline-offset: 2px;
  }

  .pager-status {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
  }

  .pager-gap {
    min-width: 80px;
  }

  .pager-reset {
    color: var(--text-heading);
  }

  .pager-reset:hover {
    color: var(--color-gold);
  }
</style>
