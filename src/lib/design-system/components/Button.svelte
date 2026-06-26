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

  let hover = $state(false);

  const sizes = {
    sm: "padding:0.4rem 0.85rem;font-size:0.75rem;gap:0.4rem",
    md: "padding:0.6rem 1.2rem;font-size:0.85rem;gap:0.5rem",
    lg: "padding:0.8rem 1.7rem;font-size:1rem;gap:0.6rem",
  };

  const base = $derived(
    `display:inline-flex;align-items:center;justify-content:center;font-family:var(--font-display);letter-spacing:0.06em;text-transform:uppercase;text-decoration:none;line-height:1;border-radius:var(--radius-md);border:1px solid transparent;cursor:${disabled ? "not-allowed" : "pointer"};opacity:${disabled ? 0.45 : 1};transition:transform var(--dur-base) var(--ease-out-soft),background var(--dur-base) ease,color var(--dur-base) ease,border-color var(--dur-base) ease,box-shadow var(--dur-base) ease;white-space:nowrap`
  );

  const variantStyles: Record<string, string> = {
    primary: "background:var(--color-gold);color:var(--color-abyss);border-color:var(--color-gold-dark);box-shadow:var(--glow-gold-soft)",
    secondary: "background:transparent;color:var(--color-text-secondary);border-color:var(--color-border-subtle)",
    ghost: "background:transparent;color:var(--color-gold);border-color:transparent",
    enchant: "background:rgba(168,85,247,0.12);color:var(--color-enchant);border-color:rgba(168,85,247,0.4)",
  };

  const hoverStyles: Record<string, string> = {
    primary: "background:var(--color-gold-light);transform:translateY(-1px);box-shadow:var(--glow-gold)",
    secondary: "color:var(--color-text-primary);border-color:var(--color-border-accent)",
    ghost: "color:var(--color-gold-light)",
    enchant: "background:rgba(168,85,247,0.2);color:#c084fc;border-color:rgba(168,85,247,0.6)",
  };

  let computedStyle = $derived(
    `${base};${sizes[size]};${variantStyles[variant]};${hover && !disabled ? hoverStyles[variant] : ""};${style}`
  );
</script>

{#if href}
  <a {href} style={computedStyle} onmouseenter={() => hover = true} onmouseleave={() => hover = false}>
    {#if icon}{@render icon()}{/if}
    {#if children}{@render children()}{/if}
  </a>
{:else}
  <button {disabled} type="button" style={computedStyle} {onclick} onmouseenter={() => hover = true} onmouseleave={() => hover = false}>
    {#if icon}{@render icon()}{/if}
    {#if children}{@render children()}{/if}
  </button>
{/if}
