<script lang="ts">
  import { pageTitle } from "#lib/site/brand.js";
  import type { PageData } from "./$types";
  import AreaGate from "#lib/manage/AreaGate.svelte";
  import CatalogManager from "#lib/achievements/CatalogManager.svelte";
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{pageTitle("Achievements")}</title></svelte:head>

{#if data.access !== "granted"}
  <AreaGate area="discord" access={data.access} returnTo="/manage/discord/achievements" />
{:else if data.catalog}
  <CatalogManager initial={data.catalog} />
{/if}
