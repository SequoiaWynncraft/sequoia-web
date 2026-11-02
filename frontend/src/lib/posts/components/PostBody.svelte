<script lang="ts">
  import { emojiUrl } from "#lib/emoji/catalog.js";

  import { parseMarkdown, type Inline } from "../markdown";

  let { source }: { source: string } = $props();

  // Rendered from tokens, never {@html}: an author's markup stays text.
  const blocks = $derived(parseMarkdown(source));
</script>

<!-- Kept on one line: whitespace between the branches would render as stray spaces. -->
{#snippet inline(nodes: Inline[])}{#each nodes as node, index (index)}{#if node.type === "text"}{node.text}{:else if node.type === "break"}<br />{:else if node.type === "code"}<code>{node.text}</code>{:else if node.type === "emoji"}<img class="emoji" src={emojiUrl(node.name)} alt={`:${node.name}:`} title={`:${node.name}:`} />{:else if node.type === "strong"}<strong>{@render inline(node.children)}</strong>{:else if node.type === "em"}<em>{@render inline(node.children)}</em>{:else if node.external}<a href={node.href} target="_blank" rel="noreferrer">{@render inline(node.children)}</a>{:else}<a href={node.href}>{@render inline(node.children)}</a>{/if}{/each}{/snippet}

<div class="post-body">
  {#each blocks as block, index (index)}
    {#if block.type === "heading" && block.level === 2}
      <h2>{@render inline(block.children)}</h2>
    {:else if block.type === "heading"}
      <h3>{@render inline(block.children)}</h3>
    {:else if block.type === "paragraph"}
      <p>{@render inline(block.children)}</p>
    {:else if block.type === "quote"}
      <blockquote>{@render inline(block.children)}</blockquote>
    {:else if block.ordered}
      <ol>
        {#each block.items as item, itemIndex (itemIndex)}
          <li>{@render inline(item)}</li>
        {/each}
      </ol>
    {:else}
      <ul>
        {#each block.items as item, itemIndex (itemIndex)}
          <li>{@render inline(item)}</li>
        {/each}
      </ul>
    {/if}
  {/each}
</div>

<style>
  .post-body {
    color: var(--text-body);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
    overflow-wrap: anywhere;
  }

  .post-body > :first-child {
    margin-top: 0;
  }

  .post-body > :last-child {
    margin-bottom: 0;
  }

  .post-body p,
  .post-body ul,
  .post-body ol,
  .post-body blockquote {
    margin: 0 0 14px;
  }

  .post-body h2,
  .post-body h3 {
    margin: 30px 0 10px;
    font-family: var(--font-display);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    text-transform: uppercase;
  }

  .post-body h2 {
    color: var(--text-heading);
    font-size: var(--text-lg);
  }

  .post-body h3 {
    color: var(--ev-accent, var(--color-gold));
    font-size: var(--text-sm);
  }

  .post-body ul,
  .post-body ol {
    padding-left: 1.4em;
  }

  .post-body li {
    margin: 4px 0;
  }

  .post-body li::marker {
    color: var(--ev-accent, var(--color-gold));
  }

  .post-body blockquote {
    padding: 2px 0 2px 16px;
    border-left: 2px solid color-mix(in srgb, var(--ev-accent, var(--color-gold)) 50%, transparent);
    color: var(--text-muted);
  }

  .post-body a {
    color: var(--ev-accent, var(--color-gold));
    text-underline-offset: 3px;
  }

  .post-body strong {
    color: var(--text-heading);
  }

  .post-body .emoji {
    display: inline-block;
    width: auto;
    height: 1.35em;
    vertical-align: -0.3em;
  }

  .post-body code {
    padding: 1px 5px;
    background: color-mix(in srgb, var(--color-border-subtle) 55%, transparent);
    font-family: var(--font-data);
    font-size: 0.9em;
  }
</style>
