<script lang="ts">
  import ManageGate from "$lib/manage/ManageGate.svelte";
  import { landingAccess } from "$lib/manage/registry";

  let { data } = $props();
</script>

<svelte:head>
  <title>Manage - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<ManageGate
  access={landingAccess(data.capabilities)}
  returnTo="/manage"
  title="Management console"
  signinText="Sign in to manage Sequoia."
  deniedText="Management is restricted to guild leadership and staff."
  backHref="/"
  backLabel="Back to home"
/>
