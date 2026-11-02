<script lang="ts">
  import type { PageData } from "./$types";
  import AreaGate from "#lib/manage/AreaGate.svelte";
  import WelcomeManager from "#lib/discord/WelcomeManager.svelte";
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Welcome messages · Sequoia</title></svelte:head>

{#if data.access !== "granted"}
  <AreaGate area="discord" access={data.access} returnTo="/manage/discord/welcome" />
{:else if data.welcome}
  <WelcomeManager initial={data.welcome} channels={data.channels} />
{/if}
