<script lang="ts">
  import AreaGate from "$lib/manage/AreaGate.svelte";
  import ManageHeader from "$lib/manage/ManageHeader.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>Announcements - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <ManageHeader area="Community" title="Announcements" />
  {#if data.access !== "granted"}
    <AreaGate area="community" access={data.access} returnTo="/manage/community/announcements" />
  {:else}
    <p class="mg-muted">Not built yet - announcements are drafted on Discord for now.</p>
  {/if}
</div>

<style>
  .mg-muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
