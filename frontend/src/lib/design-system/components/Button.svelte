<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  let {
    children,
    variant = "primary",
    size = "md",
    icon,
    disabled = false,
    href,
    onclick,
    style = "",
    type = "button",
    form,
    class: extraClass = "",
    ...rest
  }: {
    children?: Snippet;
    variant?: "primary" | "secondary" | "ghost" | "enchant";
    size?: "sm" | "md" | "lg";
    icon?: Snippet;
    disabled?: boolean;
    href?: string;
    onclick?: () => void;
    style?: string;
    type?: "button" | "submit";
    form?: string;
    class?: string;
  } & Omit<
    HTMLButtonAttributes,
    "children" | "class" | "disabled" | "form" | "onclick" | "style" | "type"
  > = $props();

  const className = $derived(
    ["seq-button", `seq-button-${variant}`, `seq-button-${size}`, extraClass]
  );
</script>

{#if href}
  <a
    href={disabled ? undefined : href}
    class={className}
    aria-disabled={disabled}
    tabindex={disabled ? -1 : undefined}
    style={style}
  >
    {#if icon}{@render icon()}{/if}
    {#if children}{@render children()}{/if}
  </a>
{:else}
  <button {...rest} {disabled} {type} {form} class={className} style={style} {onclick}>
    {#if icon}{@render icon()}{/if}
    {#if children}{@render children()}{/if}
  </button>
{/if}
