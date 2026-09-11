<script lang="ts">
  import Button from "$lib/design-system/components/Button.svelte";
  import ScopeChips from "$lib/design-system/components/ScopeChips.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import AreaGate from "$lib/manage/AreaGate.svelte";
  import ManageHeader from "$lib/manage/ManageHeader.svelte";
  import { formatPostDate } from "$lib/posts/format";
  import { POST_FEEDS, type PostStatus } from "$lib/posts/types";

  let { data } = $props();

  const STATUS_LABELS: Record<PostStatus, string> = {
    live: "Live",
    scheduled: "Scheduled",
    draft: "Draft",
    expired: "Expired",
  };

  const SCOPES = [
    { key: "all", label: "All" },
    { key: "news", label: "News" },
    { key: "announcements", label: "Announcements" },
  ];

  const scopeHref = (key: string) => (key === "all" ? "/manage/community/posts" : `/manage/community/posts?feed=${key}`);
  const newHref = $derived(
    data.feed === "all" ? "/manage/community/posts/new" : `/manage/community/posts/new?feed=${data.feed}`,
  );
</script>

<svelte:head>
  <title>Posts - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <ManageHeader area="Community" title="Posts" />

  {#if data.access !== "granted"}
    <AreaGate area="community" access={data.access} returnTo="/manage/community/posts" />
  {:else if data.entries}
    {#if data.auditWarning}
      <p class="mg-audit-warning" role="alert">
        The deletion succeeded but was not recorded in the audit log.
      </p>
    {/if}
    <div class="mg-scopes">
      <ScopeChips scopes={SCOPES} active={data.feed} href={scopeHref} label="Feed" />
    </div>
    <SectionLabel meta={String(data.entries.length)}>
      {#snippet children()}Posts{/snippet}
      {#snippet actions()}
        <Button size="sm" href={newHref}>New post</Button>
      {/snippet}
    </SectionLabel>

    {#if data.entries.length === 0}
      <p class="mg-empty">No posts in this feed yet.</p>
    {:else}
      <ul class="mg-list">
        {#each data.entries as entry (entry.slug)}
          <li>
            <a class="mg-row focus-ring" href={`/manage/community/posts/${entry.slug}`}>
              <span
                class="mg-swatch"
                aria-hidden="true"
                style="background: linear-gradient(160deg, {entry.theme.sky[0]}, {entry.theme.sky[1]}); border-color: {entry.theme.accent}"
              ></span>
              <span class="mg-name">{entry.title}</span>
              <span class="mg-chips">
                <span class="mg-chip mg-chip-feed">{POST_FEEDS[entry.feed].label}</span>
                <span class="mg-chip">{entry.audience}</span>
                {#if entry.pinned}<span class="mg-chip">Pinned</span>{/if}
              </span>
              <span class="mg-status mg-status-{entry.status}">{STATUS_LABELS[entry.status]}</span>
              <span class="mg-date">{entry.publishAt ? formatPostDate(entry.publishAt) : "-"}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .mg-page {
    padding-bottom: 48px;
  }

  .mg-audit-warning {
    margin: 0 0 18px;
    color: var(--status-error);
    font-size: var(--text-sm);
  }

  .mg-scopes {
    margin-bottom: 18px;
  }

  .mg-empty {
    margin: 0;
    padding: 22px 10px;
    border-top: 1px solid var(--color-border-subtle);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .mg-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--color-border-subtle);
  }

  .mg-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 10px;
    border-bottom: 1px solid var(--color-border-subtle);
    text-decoration: none;
    transition: background var(--dur-fast) ease;
  }

  .mg-row:hover {
    background: color-mix(in srgb, var(--color-gold) 4%, transparent);
  }

  .mg-swatch {
    flex: 0 0 34px;
    width: 34px;
    height: 22px;
    border: 1px solid;
  }

  .mg-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .mg-chips {
    display: flex;
    gap: 6px;
  }

  .mg-chip {
    padding: 3px 8px 2px;
    border: 1px solid color-mix(in srgb, var(--color-gold) 35%, transparent);
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .mg-chip-feed {
    border-color: var(--color-border-accent);
    color: var(--text-body);
  }

  .mg-status {
    min-width: 72px;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .mg-status-live {
    color: var(--color-gold);
  }

  .mg-date {
    min-width: 96px;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .mg-chips,
    .mg-date {
      display: none;
    }
  }
</style>
