<script lang="ts">
  import { pageTitle } from "#lib/site/brand.js";
  import ManageHeader from "#lib/manage/ManageHeader.svelte";
  import SectionLabel from "#lib/design-system/components/SectionLabel.svelte";
  import { messageLink, settingsAuditChanges } from "#lib/manage/auditTarget.js";
  import type { AuditEntry } from "#lib/server/auditLog.js";
  import AreaGate from "#lib/manage/AreaGate.svelte";

  let { data } = $props();

  function when(at: number): string {
    return new Date(at).toLocaleString("en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
  }

  let source = $state("all");
  let search = $state("");
  const visible = $derived((data.entries ?? []).filter((entry: AuditEntry) =>
    (source === "all" || entry.source === source)
    && [entry.action, entry.subject, entry.actor, entry.actorDiscordId, entry.detail ?? ""]
      .some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))));

  function detail(entry: AuditEntry): string {
    if (!entry.detail) return "";
    try { return JSON.stringify(JSON.parse(entry.detail), null, 2); }
    catch { return entry.detail; }
  }
</script>

<svelte:head>
  <title>{pageTitle("Audit log")}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <ManageHeader area="Development" title="Audit log" />

  {#if data.access !== "granted"}
    <AreaGate area="development" access={data.access} returnTo="/manage/development/audit" />
  {:else if data.entries === null}
    <p class="mg-muted" role="alert">
      The audit log is unavailable right now - actions may be recorded that cannot be shown. Reload to retry.
    </p>
  {:else}
    <SectionLabel meta={`newest ${data.entries.length}, up to 200`}>
      {#snippet children()}Website and Discord actions{/snippet}
    </SectionLabel>
    <div class="audit-filters">
      <label>Source
        <select bind:value={source}>
          <option value="all">All actions</option>
          <option value="website">Website</option>
          <option value="discord">Discord</option>
        </select>
      </label>
      <label>Find in recent actions
        <input type="search" bind:value={search} placeholder="Actor, action or target ID" />
      </label>
    </div>
    <p class="mg-muted" aria-live="polite">{visible.length} matching actions in the newest {data.entries.length} records.</p>
    {#if data.entries.length === 0}
      <p class="mg-muted">Nothing recorded yet - actions land here as they happen.</p>
    {:else if visible.length === 0}
      <p class="mg-muted">No recent actions match these filters.</p>
    {:else}
      <ol class="audit-entries">
        {#each visible as entry (entry.id)}
          {@const changes = settingsAuditChanges(entry)}
          <li>
            <div class="audit-heading">
              <strong>{entry.action}</strong>
              <time datetime={new Date(entry.at).toISOString()}>{when(entry.at)} UTC</time>
            </div>
            <div class="audit-meta">
              {#if entry.actorMinecraftUuid}
                <a href={`/statistics/global/players/${encodeURIComponent(entry.actorMinecraftUuid)}`}>{entry.actor}</a>
              {:else}<span>{entry.actor}</span>{/if}
              <span>Discord ID {entry.actorDiscordId}</span>
              <span>{entry.source === "discord" ? "Discord" : "Website"}</span>
            </div>
            <p class="audit-target">Target: {entry.subject}</p>
            {#if entry.source === "discord"}
              <div class="audit-links">
                <a href="/manage/discord">Discord manager</a>
                {#if messageLink(entry)}<a href={messageLink(entry)} target="_blank" rel="noreferrer">Open message in Discord</a>{/if}
              </div>
            {/if}
            {#if changes?.length}
              <ul class="audit-changes" aria-label="Changed settings">
                {#each changes as change (change.key ?? change.label)}
                  <li><strong>{change.label}</strong><span>Before: {change.before}</span><span>After: {change.after}</span></li>
                {/each}
              </ul>
            {/if}
            {#if entry.detail}
              <details><summary>Change details</summary><pre>{detail(entry)}</pre></details>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</div>

<style>
  .audit-filters { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; }
  .audit-filters label { display: grid; gap: .4rem; flex: 1 1 12rem; font-size: var(--text-sm); }
  input, select { min-width: 0; width: 100%; padding: .6rem; color: var(--text-heading); background: var(--surface-card); border: 1px solid var(--border-default); border-radius: .25rem; }
  .audit-entries { list-style: none; padding: 0; margin: 1rem 0; }
  .audit-entries li { padding: 1rem 0; border-top: 1px solid var(--border-default); }
  .audit-heading, .audit-meta, .audit-links { display: flex; flex-wrap: wrap; gap: .5rem 1rem; }
  .audit-heading { justify-content: space-between; }
  .audit-heading strong, .audit-target { overflow-wrap: anywhere; }
  .audit-meta, time { color: var(--text-muted); font-size: var(--text-sm); }
  .audit-meta { margin-top: .5rem; }
  .audit-target { margin: .5rem 0; font-size: var(--text-sm); }
  .audit-links { margin-bottom: .5rem; font-size: var(--text-sm); }
  .audit-entries .audit-changes { display: grid; gap: .5rem; margin: 0 0 .5rem; padding: 0; list-style: none; font-size: var(--text-sm); }
  .audit-entries .audit-changes li { display: grid; gap: .15rem; padding: 0; border: 0; overflow-wrap: anywhere; }
  .audit-changes span { color: var(--text-muted); }
  details { font-size: var(--text-sm); }
  summary { cursor: pointer; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .75rem; max-height: 24rem; overflow: auto; }
  .mg-muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
