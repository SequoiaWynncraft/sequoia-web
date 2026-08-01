<script lang="ts">
  import ManageGate from "$lib/manage/ManageGate.svelte";
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
    <ManageGate
      access={data.access}
      returnTo="/manage/community/announcements"
      title="Community branch only"
      signinText="Sign in to manage announcements."
      deniedText="Announcements are for the Community branch and guild leadership."
      backHref="/manage"
      backLabel="Back to manage"
    />
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
