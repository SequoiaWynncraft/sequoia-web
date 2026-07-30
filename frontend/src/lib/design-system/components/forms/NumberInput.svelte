<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  let {
    value = $bindable(null),
    invalid = false,
    ...rest
  }: {
    value?: number | null;
    invalid?: boolean;
  } & Omit<HTMLInputAttributes, "value" | "type"> = $props();
</script>

<input
  {...rest}
  type="number"
  class="seq-input seq-input-mono"
  aria-invalid={invalid || undefined}
  bind:value
/>
