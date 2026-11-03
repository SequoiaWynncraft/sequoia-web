<script lang="ts">
  import { pageTitle } from "#lib/site/brand.js";
  import PostArticle from "#lib/posts/components/PostArticle.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>{pageTitle(data.post.title)}</title>
  <meta name="description" content={data.post.summary} />
</svelte:head>

<PostArticle
  post={data.post}
  manager={data.manager}
  backHref="/services/announcements"
  backLabel="Announcements"
/>
