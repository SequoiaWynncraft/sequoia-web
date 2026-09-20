<script lang="ts">
  import AreaGate from "$lib/manage/AreaGate.svelte";
  import ManageHeader from "$lib/manage/ManageHeader.svelte";
  import PostEditor from "$lib/posts/editor/PostEditor.svelte";

  let { data, form } = $props();
</script>

<svelte:head>
  <title>{data.stored ? `Edit ${data.stored.post.title}` : "Edit post"} - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page-wide">
  {#if data.access !== "granted"}
    <ManageHeader area="Community" title="Edit post" />
    <AreaGate area="community" access={data.access} returnTo="/manage/community/posts" />
  {:else if data.stored}
    <ManageHeader area="Community" title={data.stored.post.title} />
    <nav class="mg-back">
      <a class="focus-ring" href="/manage/community/posts">◆ All posts</a>
    </nav>
    {#key data.stored.post.slug}
      <PostEditor
        mode="edit"
        initial={data.stored.post}
        initialPublished={data.stored.published}
        initialUpdatedAt={data.stored.updatedAt}
        context={data.context}
        error={form?.error ?? null}
        saved={form?.saved ?? false}
        auditWarning={form ? (form.auditWarning ?? false) : data.auditWarning}
      />
    {/key}
  {/if}
</div>

<style>
  .mg-page-wide {
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
</style>
