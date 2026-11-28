<script lang="ts">
  import DiscordSpoiler from "./DiscordSpoiler.svelte";
  import { formatTimestamp } from "./format";
  import { isJumboEmoji, parseDiscordMarkdown, type DiscordNode, type MarkdownSurface } from "./markdown";

  let {
    source,
    surface = "content",
    names,
    now,
    jumbo = false,
  }: {
    source: string;
    surface?: MarkdownSurface;
    names: { roles: Map<string, string>; channels: Map<string, string> };
    now: number;
    jumbo?: boolean;
  } = $props();

  const nodes = $derived(parseDiscordMarkdown(source, surface));
  const large = $derived(jumbo && isJumboEmoji(nodes));

  function emojiSrc(id: string, animated: boolean) {
    return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=${large ? 96 : 48}`;
  }

  function mention(node: Extract<DiscordNode, { type: "mention" }>): string {
    switch (node.kind) {
      case "role":
        return `@${names.roles.get(node.id) ?? "deleted-role"}`;
      case "channel":
        return `#${names.channels.get(node.id) ?? "unknown"}`;
      case "user":
        return "@member";
      case "command":
        return `/${node.name}`;
      case "navigation":
        return node.name;
      default:
        return `@${node.kind}`;
    }
  }
</script>

<!-- Kept on one line per construct: the root keeps Discord's white-space, so whitespace between tags would render. -->
{#snippet render(list: DiscordNode[])}{#each list as node, index (index)}{#if node.type === "text"}{node.text}{:else if node.type === "br"}<br />{:else if node.type === "strong"}<strong>{@render render(node.children)}</strong>{:else if node.type === "em"}<em>{@render render(node.children)}</em>{:else if node.type === "underline"}<u>{@render render(node.children)}</u>{:else if node.type === "strike"}<s>{@render render(node.children)}</s>{:else if node.type === "spoiler"}<DiscordSpoiler>{@render render(node.children)}</DiscordSpoiler>{:else if node.type === "inlineCode"}<code class="dm-code">{node.text}</code>{:else if node.type === "codeBlock"}<pre class="dm-pre"><code>{node.text}</code></pre>{:else if node.type === "blockQuote"}<div class="dm-quote"><span class="dm-quote-bar" aria-hidden="true"></span><blockquote>{@render render(node.children)}</blockquote></div>{:else if node.type === "heading"}{#if node.level === 1}<h1 class="dm-h">{@render render(node.children)}</h1>{:else if node.level === 2}<h2 class="dm-h">{@render render(node.children)}</h2>{:else}<h3 class="dm-h">{@render render(node.children)}</h3>{/if}{:else if node.type === "subtext"}<small class="dm-subtext">{@render render(node.children)}</small>{:else if node.type === "list"}{#if node.ordered}<ol class="dm-list" start={node.start}>{#each node.items as item, itemIndex (itemIndex)}<li>{@render render(item)}</li>{/each}</ol>{:else}<ul class="dm-list">{#each node.items as item, itemIndex (itemIndex)}<li>{@render render(item)}</li>{/each}</ul>{/if}{:else if node.type === "link"}<a class="dm-link" href={node.href} target="_blank" rel="noopener noreferrer">{@render render(node.children)}</a>{:else if node.type === "mention"}<span class="dm-mention" title={"id" in node ? node.id : undefined}>{mention(node)}</span>{:else if node.type === "emoji"}{#if node.id}<img class="dm-emoji" src={emojiSrc(node.id, node.animated)} alt={`:${node.name}:`} title={`:${node.name}:`} draggable="false" />{:else}<span class="dm-emoji dm-emoji-text">{node.name}</span>{/if}{:else if node.type === "timestamp"}<time class="dm-time" datetime={new Date(node.seconds * 1000).toISOString()}>{formatTimestamp(node.seconds, node.format, now)}</time>{/if}{/each}{/snippet}

<div class="dm" class:dm-jumbo={large} class:dm-title={surface === "title"}>{@render render(nodes)}</div>

<style>
  .dm {
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  .dm-code {
    padding: 0.2em;
    border-radius: 4px;
    background: var(--dm-code-bg, #2b2d31);
    border: 1px solid var(--dm-code-border, #1e1f22);
    font-family: var(--font-mono);
    font-size: 0.85em;
    line-height: 1.125rem;
    white-space: pre-wrap;
  }

  .dm-pre {
    max-width: 100%;
    margin: 6px 0 0;
    padding: 0.5em;
    border: 1px solid #1e1f22;
    border-radius: 4px;
    background: var(--dm-code-bg, #2b2d31);
    color: #dbdee1;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    line-height: 1.125rem;
    white-space: pre-wrap;
    overflow-x: auto;
  }

  .dm-quote {
    display: flex;
    min-width: 0;
  }

  .dm-quote-bar {
    flex: 0 0 4px;
    border-radius: 4px;
    background: #4e5058;
  }

  .dm-quote blockquote {
    min-width: 0;
    margin: 0;
    padding: 0 8px 0 12px;
  }

  .dm-h {
    margin: 8px 0 4px;
    color: #f2f3f5;
    font-family: inherit;
    font-weight: 700;
    line-height: 1.375em;
    letter-spacing: normal;
    text-transform: none;
  }

  h1.dm-h {
    font-size: 1.5rem;
  }

  h2.dm-h {
    font-size: 1.25rem;
  }

  h3.dm-h {
    font-size: 1rem;
  }

  .dm > .dm-h:first-child {
    margin-top: 0;
  }

  .dm-subtext {
    display: block;
    color: #949ba4;
    font-size: 0.8125rem;
    line-height: 1.1rem;
  }

  .dm-list {
    margin: 4px 0 0 16px;
    padding: 0;
    list-style-position: outside;
  }

  ul.dm-list {
    list-style-type: disc;
  }

  ul.dm-list ul.dm-list {
    list-style-type: circle;
  }

  ol.dm-list {
    list-style-type: decimal;
  }

  .dm-list li {
    margin-bottom: 4px;
  }

  .dm-link {
    color: #00a8fc;
    text-decoration: none;
  }

  .dm-link:hover {
    text-decoration: underline;
  }

  .dm-link:focus-visible,
  .dm-mention:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 1px;
  }

  .dm-mention {
    padding: 0 2px;
    border-radius: 3px;
    background: rgb(88 101 242 / 0.3);
    color: #c9cdfb;
    font-weight: 500;
  }

  .dm-emoji {
    width: 1.375em;
    height: 1.375em;
    vertical-align: bottom;
    object-fit: contain;
  }

  .dm-emoji-text {
    display: inline-block;
    width: auto;
    font-size: 1.1em;
    line-height: 1.25;
  }

  .dm-jumbo .dm-emoji {
    width: 3rem;
    height: 3rem;
    min-height: 3rem;
  }

  .dm-jumbo .dm-emoji-text {
    font-size: 2.6rem;
    line-height: 3rem;
  }

  .dm-time {
    padding: 0 2px;
    border-radius: 3px;
    background: rgb(255 255 255 / 0.06);
  }

  .dm-title {
    display: inline;
  }
</style>
