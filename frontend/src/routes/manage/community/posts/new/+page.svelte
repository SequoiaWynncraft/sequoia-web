<script lang="ts">
  import AreaGate from "#lib/manage/AreaGate.svelte";
  import ManageHeader from "#lib/manage/ManageHeader.svelte";
  import PostEditor from "#lib/posts/editor/PostEditor.svelte";

  let { data, form } = $props();
</script>

<svelte:head>
  <title>New post - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page-wide">
  <ManageHeader area="Community" title="New post" />

  {#if data.access !== "granted"}
    <AreaGate area="community" access={data.access} returnTo="/manage/community/posts/new" />
  {:else}
    <PostEditor
      mode="create"
      initialFeed={data.feed}
      context={data.context}
      error={form?.error ?? null}
    />
  {/if}
</div>

<style>
  .mg-page-wide {
    padding-bottom: 48px;
  }
</style>
