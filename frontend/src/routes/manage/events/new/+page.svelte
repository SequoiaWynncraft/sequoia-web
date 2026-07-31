<script lang="ts">
  import ManageHeader from "$lib/manage/ManageHeader.svelte";
  import EventEditor from "$lib/events/editor/EventEditor.svelte";
  import EventsGate from "../EventsGate.svelte";

  let { data, form } = $props();
</script>

<svelte:head>
  <title>New event - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <ManageHeader area="Events" title="New event" />

  {#if data.access !== "granted"}
    <EventsGate access={data.access} returnTo="/manage/events/new" />
  {:else}
    <EventEditor
      mode="create"
      context={data.context}
      error={form?.error ?? null}
      trackerCreated={form?.trackerCreated ?? null}
      trackerUpdated={form?.trackerUpdated ?? null}
      trackerError={form?.trackerError ?? null}
      presetError={form?.presetError ?? null}
      auditWarning={form?.auditWarning ?? false}
    />
  {/if}
</div>

<style>
  .mg-page {
    width: min(1200px, 100% - 3rem);
    margin: 0 auto;
    padding-bottom: 48px;
  }

  @media (max-width: 640px) {
    .mg-page {
      width: min(1200px, 100% - 2rem);
    }
  }
</style>
