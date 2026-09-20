<script lang="ts">
  import { themeVars } from "$lib/events/theme";
  import type { PostView } from "$lib/server/postPages";

  import { formatPostDate } from "../format";
  import type { PostStatus } from "../types";
  import PostBody from "./PostBody.svelte";

  let {
    post,
    manager,
    backHref,
    backLabel,
  }: {
    post: PostView;
    manager: boolean;
    backHref: string;
    backLabel: string;
  } = $props();

  const STATUS_NOTES: Record<PostStatus, string | null> = {
    live: null,
    draft: "Draft. Only post managers can see this.",
    scheduled: "Scheduled. Hidden until the publish date.",
    expired: "Expired. Only post managers can see this.",
  };
</script>

<article class="ps-article" style={themeVars(post.theme)}>
  <div class="ps-article-sky" aria-hidden="true"></div>

  <a class="ps-back focus-ring" href={backHref}>
    <span class="ps-back-diamond" aria-hidden="true">◆</span>{backLabel}
  </a>

  <header class="ps-hero">
    <span class="ps-hero-spark ps-enter" style="--enter: 0" aria-hidden="true">✦</span>
    <h1 class="ps-hero-title ps-enter" style="--enter: 1">{post.title}</h1>
    <p class="ps-hero-summary ps-enter" style="--enter: 2">{post.summary}</p>
    <p class="ps-hero-meta ps-enter" style="--enter: 3">
      <time datetime={post.date}>{formatPostDate(post.date)}</time>
      {#if post.author}<span>· {post.author}</span>{/if}
      {#if post.audience}<span class="ps-hero-chip">{post.audience}</span>{/if}
    </p>
    {#if manager}
      <p class="ps-manager-note ps-enter" style="--enter: 3">
        {STATUS_NOTES[post.status] ?? ""}
        <a class="focus-ring" href={`/manage/community/posts/${post.slug}`}>Edit</a>
      </p>
    {/if}
  </header>

  <div class="ps-article-body ps-enter" style="--enter: 4">
    <PostBody source={post.body} />
  </div>
</article>

<style>
  .ps-article {
    position: relative;
    isolation: isolate;
    min-height: 60vh;
  }

  .ps-article-sky {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    /* Whatever the page height, the sky never ends on a hard edge. */
    mask-image: linear-gradient(to bottom, black calc(100% - 320px), transparent);
    -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 320px), transparent);
    background:
      radial-gradient(56% 360px at 50% 260px, color-mix(in srgb, var(--ev-accent) 11%, transparent), transparent 72%),
      linear-gradient(
        180deg,
        var(--ev-sky-0) 0px,
        var(--ev-sky-1) 420px,
        color-mix(in srgb, var(--ev-sky-1) 40%, var(--color-abyss)) 900px,
        transparent 1500px
      );
  }

  .ps-article-sky::before {
    content: "";
    position: absolute;
    top: -140px;
    left: -10%;
    right: -10%;
    height: 1400px;
    background:
      radial-gradient(circle, var(--ev-star) 1px, transparent 1.5px) 24px 41px / 233px 141px,
      radial-gradient(circle, var(--ev-star) 0.8px, transparent 1.3px) 131px 87px / 337px 97px,
      radial-gradient(circle, var(--ev-star) 0.6px, transparent 1.1px) 61px 13px / 149px 113px;
    opacity: 0.7;
    transform: rotate(-4deg);
    mask-image: linear-gradient(to bottom, black 0, black 600px, transparent 1200px);
    -webkit-mask-image: linear-gradient(to bottom, black 0, black 600px, transparent 1200px);
  }

  /* The sky runs under the fixed translucent navbar (the layout drops its top
     padding for post pages), so the hero clears it with its own. */
  .ps-hero {
    display: grid;
    justify-items: center;
    padding: calc(3.5rem + 72px) 24px 44px;
    text-align: center;
  }

  .ps-enter {
    animation: seq-fade-in-up 0.55s var(--ease-out-soft) both;
    animation-delay: calc(var(--enter) * 90ms);
  }

  .ps-back {
    position: absolute;
    top: calc(3.5rem + 18px);
    left: 22px;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-decoration: none;
    text-transform: uppercase;
    transition: color var(--dur-fast) ease;
  }

  .ps-back:hover {
    color: var(--color-gold);
  }

  .ps-back-diamond {
    margin-right: 7px;
    color: var(--color-gold);
    font-size: 0.8em;
  }

  .ps-hero-spark {
    margin-bottom: 18px;
    color: var(--ev-accent);
    font-size: 1.4rem;
    line-height: 1;
    text-shadow: 0 0 18px color-mix(in srgb, var(--ev-accent) 60%, transparent);
  }

  .ps-hero-title {
    max-width: 24ch;
    margin: 0 0 12px;
    background: linear-gradient(90deg, var(--ev-accent), var(--ev-accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    font-family: var(--font-display);
    font-size: clamp(1.6rem, 4.5vw, 3rem);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    overflow-wrap: anywhere;
    text-transform: uppercase;
  }

  .ps-hero-summary {
    max-width: 60ch;
    margin: 0 0 18px;
    color: var(--text-body);
    font-size: var(--text-base);
  }

  .ps-hero-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .ps-hero-chip {
    margin-left: 4px;
    padding: 3px 8px 2px;
    border: 1px solid color-mix(in srgb, var(--color-gold) 35%, transparent);
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .ps-manager-note {
    margin: 14px 0 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .ps-manager-note a {
    margin-left: 6px;
    color: var(--ev-accent);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-decoration: none;
    text-transform: uppercase;
  }

  .ps-article-body {
    width: min(68ch, 100% - 3rem);
    margin: 0 auto;
    padding: 8px 0 80px;
  }

  @media (prefers-reduced-motion: reduce) {
    .ps-enter {
      animation: none;
    }
  }

  @media (max-width: 700px) {
    .ps-article-body {
      width: min(68ch, 100% - 2rem);
    }
  }
</style>
