<script lang="ts">
  import type { Snippet } from "svelte";
  import Container from "./Container.svelte";
  import Breadcrumbs, { type Crumb } from "./Breadcrumbs.svelte";
  import SectionTabs from "./SectionTabs.svelte";
  import type { NavLeaf } from "#lib/site/nav.js";

  let {
    crumbs,
    tabs,
    width = "lg",
    children,
  }: {
    crumbs: Crumb[];
    tabs?: NavLeaf[];
    width?: "md" | "lg" | "xl";
    children: Snippet;
  } = $props();
</script>

<Container {width}>
  <Breadcrumbs items={crumbs} />
  {#if tabs && tabs.length > 0}
    <SectionTabs items={tabs} />
  {/if}
  {@render children()}
</Container>
