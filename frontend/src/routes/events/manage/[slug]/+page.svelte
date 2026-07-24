<script lang="ts">
  import PageHeader from "$lib/components/PageHeader.svelte";
  import EventForm from "../EventForm.svelte";
  import ManageGate from "../ManageGate.svelte";

  let { data, form } = $props();
</script>

<svelte:head>
  <title>{data.stored ? `Edit ${data.stored.event.name}` : "Edit event"} - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  {#if data.access !== "manager"}
    <PageHeader kicker="Events" title="Edit event" />
    <ManageGate access={data.access} returnTo="/events/manage" />
  {:else if data.stored}
    <PageHeader kicker="Events" title={data.stored.event.name} />
    <nav class="mg-back">
      <a class="focus-ring" href="/events/manage">◆ All events</a>
    </nav>
    {#key data.stored.event.slug}
      <EventForm
        mode="edit"
        initial={data.stored.event}
        initialPublished={data.stored.published}
        initialUpdatedAt={data.stored.updatedAt}
        context={data.context}
        error={form?.error ?? null}
        saved={form?.saved ?? false}
        trackerCreated={form?.trackerCreated ?? null}
        trackerUpdated={form?.trackerUpdated ?? null}
        trackerError={form?.trackerError ?? null}
        presetError={form?.presetError ?? null}
        auditWarning={(form?.auditWarning ?? false) || data.auditWarning}
      />
    {/key}
  {/if}
</div>

<style>
  .mg-page {
    width: min(1200px, 100% - 3rem);
    margin: 0 auto;
    padding-bottom: 48px;
  }

  .mg-back {
    margin: -6px 0 22px;
  }

  .mg-back a {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-decoration: none;
    text-transform: uppercase;
    transition: color var(--dur-fast) ease;
  }

  .mg-back a:hover {
    color: var(--color-gold);
  }

  @media (max-width: 640px) {
    .mg-page {
      width: min(1200px, 100% - 2rem);
    }
  }
</style>
