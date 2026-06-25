<script lang="ts">
  import type { Snippet } from "svelte";

  let { children, width = "lg", style = "" }: { children: Snippet; width?: "md" | "lg" | "xl"; style?: string } = $props();
  const max = { md: "var(--container-md)", lg: "var(--container-lg)", xl: "var(--container-xl)" }[width];
</script>

<div style="width:100%;max-width:{max};margin:0 auto;padding:0 1.25rem;{style}">
  {@render children()}
</div>
