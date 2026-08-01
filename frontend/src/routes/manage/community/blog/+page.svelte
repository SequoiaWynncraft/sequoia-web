<script lang="ts">
  import ManageGate from "$lib/manage/ManageGate.svelte";
  import ManageHeader from "$lib/manage/ManageHeader.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>Blog - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <ManageHeader area="Community" title="Blog" />
  {#if data.access !== "granted"}
    <ManageGate
      access={data.access}
      returnTo="/manage/community/blog"
      title="Community branch only"
      signinText="Sign in to manage blog posts."
      deniedText="The blog is for the Community branch and guild leadership."
      backHref="/manage"
      backLabel="Back to manage"
    />
  {:else}
    <p class="mg-muted">Not built yet - posts will be authored here once the blog ships.</p>
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
