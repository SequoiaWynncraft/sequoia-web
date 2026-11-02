<script lang="ts">
  import { discordPath } from "#lib/icons.js";
  let { size = 16 }: { size?: number } = $props();
</script>

<svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
  <path d={discordPath} />
</svg>
