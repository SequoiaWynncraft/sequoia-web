<script lang="ts">
  import ManageGate from "$lib/manage/ManageGate.svelte";
  import type { AreaAccess } from "$lib/manage/types";

  let { access, returnTo }: { access: Exclude<AreaAccess, "granted">; returnTo: string } =
    $props();
</script>

<ManageGate
  {access}
  {returnTo}
  title="Guild leadership only"
  signinText="Sign in to manage guild events."
  deniedText="Events are managed by strategists and above."
  backHref="/events"
  backLabel="Back to events"
/>
