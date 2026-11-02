<script lang="ts">
  import AreaGate from "#lib/manage/AreaGate.svelte";
  import ManageHeader from "#lib/manage/ManageHeader.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>Blog - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <ManageHeader area="Community" title="Blog" />
  {#if data.access !== "granted"}
    <AreaGate area="community" access={data.access} returnTo="/manage/community/blog" />
  {:else}
    <p class="mg-muted">Not built yet - posts will be authored here once the blog ships.</p>
  {/if}
</div>

<style>
  .mg-muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
