<script lang="ts">
  import { pageTitle } from "#lib/site/brand.js";
  import type { PageData } from "./$types";
  import AreaGate from "#lib/manage/AreaGate.svelte";
  import DiscordEditor from "#lib/discord/DiscordEditor.svelte";
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{pageTitle("Discord messages")}</title></svelte:head>

{#if data.access !== "granted"}
  <AreaGate area="discord" access={data.access} returnTo="/manage/discord" />
{:else if data.context}
  <DiscordEditor initial={data.messages} context={data.context} problem={data.problem} />
{/if}
