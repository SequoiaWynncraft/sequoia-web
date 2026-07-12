<script lang="ts">
  import PageHeader from "$lib/components/PageHeader.svelte";
  import EventForm from "../EventForm.svelte";
  import ManageGate from "../ManageGate.svelte";

  let { data, form } = $props();
</script>

<svelte:head>
  <title>New event - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <PageHeader kicker="Events" title="New event" />

  {#if data.access !== "manager"}
    <ManageGate access={data.access} returnTo="/events/manage/new" />
  {:else}
    <EventForm mode="create" error={form?.error ?? null} />
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
