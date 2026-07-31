<script lang="ts">
  import ManageHeader from "$lib/manage/ManageHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import type { AuditEntry } from "$lib/server/auditLog";
  import { nmsrFace } from "$lib/site/nmsr";
  import EventsGate from "../EventsGate.svelte";

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

  const columns: LedgerColumn<AuditEntry>[] = [
    {
      key: "at",
      label: "When (UTC)",
      numeric: true,
      value: (entry) => when(entry.at),
      sortValue: (entry) => entry.at,
    },
    {
      key: "actor",
      label: "Who",
      nameStyle: true,
      value: (entry) => entry.actor,
      sortValue: (entry) => entry.actor.toLowerCase(),
      avatar: (entry) => (entry.actorMinecraftUuid ? nmsrFace(entry.actorMinecraftUuid, 22) : null),
      // UUIDs are the stable identifier; some sessions have no Minecraft name.
      href: (entry) =>
        entry.actorMinecraftUuid
          ? `/statistics/global/players/${encodeURIComponent(entry.actorMinecraftUuid)}`
          : null,
    },
    {
      key: "action",
      label: "Action",
      value: (entry) => entry.action,
      sortValue: (entry) => entry.action,
    },
    {
      key: "subject",
      label: "Subject",
      value: (entry) => entry.subject,
      sortValue: (entry) => entry.subject,
    },
    {
      key: "detail",
      label: "Detail",
      value: (entry) => entry.detail ?? "-",
      sortable: false,
    },
  ];
</script>

<svelte:head>
  <title>Audit log - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <ManageHeader area="Events" title="Audit log" />

  {#if data.access !== "granted"}
    <EventsGate access={data.access} returnTo="/manage/events/audit" />
  {:else if data.entries === null}
    <p class="mg-muted" role="alert">
      The audit log is unavailable right now - actions may be recorded that cannot be shown. Reload to retry.
    </p>
  {:else}
    <SectionLabel meta={`latest ${data.entries.length}`}>
      {#snippet children()}Management actions{/snippet}
    </SectionLabel>
    {#if data.entries.length === 0}
      <p class="mg-muted">Nothing recorded yet - actions land here as they happen.</p>
    {:else}
      <LedgerTable
        columns={columns}
        rows={data.entries}
        rowKey={(entry) => String(entry.id)}
        defaultSort="at"
        defaultDescending={true}
        showRank={false}
        maxHeight="640px"
      />
    {/if}
  {/if}
</div>

<style>
  .mg-page {
    width: min(1100px, 100% - 3rem);
    margin: 0 auto;
  }

  .mg-muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
