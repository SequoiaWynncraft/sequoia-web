<script lang="ts">
  import PostArticle from "#lib/posts/components/PostArticle.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>{data.post.title} - Sequoia</title>
  <meta name="description" content={data.post.summary} />
</svelte:head>

<PostArticle
  post={data.post}
  manager={data.manager}
  backHref="/services/announcements"
  backLabel="Announcements"
/>
