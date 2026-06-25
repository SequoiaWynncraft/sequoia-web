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

  let h = $state(false);

  let lift = $derived(
    hoverEffect && h
      ? "transform:translateY(-6px) scale(1.025);box-shadow:var(--shadow-card-hover);border-color:rgba(168,85,247,0.5)"
      : ""
  );

  let base = $derived(
    `position:relative;display:block;background:var(--surface-card);border:1px solid ${hoverEffect ? "rgba(245,197,66,0.3)" : "var(--color-border-subtle)"};border-radius:var(--radius-lg);padding:${padding};overflow:hidden;text-decoration:none;color:inherit;transition:transform var(--dur-slow) var(--ease-out-soft),box-shadow var(--dur-slow) ease,border-color var(--dur-slow) ease;${lift};${style}`
  );
</script>

{#if href}
  <a {href} style={base} onmouseenter={() => h = true} onmouseleave={() => h = false}>
    {#if topRule}
      <span style="position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(to right,transparent,rgba(245,197,66,0.4),transparent)"></span>
    {/if}
    {@render children()}
  </a>
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div style={base} onmouseenter={() => h = true} onmouseleave={() => h = false}>
    {#if topRule}
      <span style="position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(to right,transparent,rgba(245,197,66,0.4),transparent)"></span>
    {/if}
    {@render children()}
  </div>
{/if}
