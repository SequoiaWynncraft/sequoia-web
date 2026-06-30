<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    variant = "primary",
    size = "md",
    icon,
    disabled = false,
    href,
    onclick,
    style = "",
  }: {
    children?: Snippet;
    variant?: "primary" | "secondary" | "ghost" | "enchant";
    size?: "sm" | "md" | "lg";
    icon?: Snippet;
    disabled?: boolean;
    href?: string;
    onclick?: () => void;
    style?: string;
  } = $props();

  const className = $derived(
    `seq-button seq-button-${variant} seq-button-${size}`
  );
</script>

{#if href}
  <a {href} class={className} aria-disabled={disabled} style={style}>
    {#if icon}{@render icon()}{/if}
    {#if children}{@render children()}{/if}
  </a>
{:else}
  <button {disabled} type="button" class={className} style={style} {onclick}>
    {#if icon}{@render icon()}{/if}
    {#if children}{@render children()}{/if}
  </button>
{/if}
