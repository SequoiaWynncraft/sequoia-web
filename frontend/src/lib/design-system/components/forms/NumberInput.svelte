<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  let {
    value = $bindable(),
    invalid = false,
    class: extraClass = "",
    "aria-invalid": ariaInvalid,
    ...rest
  }: {
    value?: number | null | undefined;
    invalid?: boolean;
  } & Omit<HTMLInputAttributes, "value" | "type"> = $props();
</script>

<input
  {...rest}
  type="number"
  class={["seq-input", "seq-input-mono", extraClass]}
  aria-invalid={invalid ? true : ariaInvalid}
  bind:value
/>
