<script lang="ts">
  import type { PageData } from "./$types";
  import ManageGate from "$lib/manage/ManageGate.svelte";
  import DiscordEditor from "$lib/discord/DiscordEditor.svelte";
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Discord messages · Sequoia</title></svelte:head>

{#if data.access !== "granted"}
  <ManageGate access={data.access} returnTo="/manage/discord" title="Discord management" signinText="Sign in to manage Discord messages." deniedText="Discord messages are managed by guild leadership and the Community, Military and Development branches." backHref="/manage" backLabel="Back to manage" />
{:else if data.context}
  <DiscordEditor initial={data.messages} context={data.context} problem={data.problem} />
{/if}
