<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    topRule = true,
    hoverEffect = true,
    padding = "1.25rem",
    href,
    style = "",
  }: {
    children: Snippet;
    topRule?: boolean;
    hoverEffect?: boolean;
    padding?: string;
    href?: string;
    style?: string;
  } = $props();

  const className = $derived(
    hoverEffect ? "seq-card seq-card-hoverable" : "seq-card seq-card-static"
  );
  const computedStyle = $derived(
    `--seq-card-padding:${padding};${style}`
  );
</script>

{#if href}
  <a {href} class={className} style={computedStyle}>
    {#if topRule}
      <span class="seq-card-rule"></span>
    {/if}
    {@render children()}
  </a>
{:else}
  <div class={className} style={computedStyle}>
    {#if topRule}
      <span class="seq-card-rule"></span>
    {/if}
    {@render children()}
  </div>
{/if}
