<script lang="ts">
  import { pageTitle } from "#lib/site/brand.js";
  import ManageHeader from "#lib/manage/ManageHeader.svelte";
  import EventEditor from "#lib/events/editor/EventEditor.svelte";
  import AreaGate from "#lib/manage/AreaGate.svelte";

  let { data, form } = $props();
</script>

<svelte:head>
  <title>{pageTitle("New event")}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page-wide">
  <ManageHeader area="Events" title="New event" />

  {#if data.access !== "granted"}
    <AreaGate area="events" access={data.access} returnTo="/manage/events/new" />
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
  .mg-page-wide {
    padding-bottom: 48px;
  }
</style>
