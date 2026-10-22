<script lang="ts">
  import type { PageData } from "./$types";
  import AreaGate from "$lib/manage/AreaGate.svelte";
  import CeremonyManager from "$lib/discord/CeremonyManager.svelte";
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Achievement ceremonies · Sequoia</title></svelte:head>

{#if data.access !== "granted"}
  <AreaGate area="discord" access={data.access} returnTo="/manage/discord/ceremonies" />
{:else if data.ceremonies}
  <CeremonyManager initial={data.ceremonies} channels={data.channels} />
{/if}
