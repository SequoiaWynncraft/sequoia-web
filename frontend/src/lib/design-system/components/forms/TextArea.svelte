<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";

  let {
    value = $bindable(),
    invalid = false,
    class: extraClass = "",
    "aria-invalid": ariaInvalid,
    ...rest
  }: {
    value?: string | undefined;
    invalid?: boolean;
  } & Omit<HTMLTextareaAttributes, "value"> = $props();
</script>

<textarea {...rest} class={["seq-input", extraClass]} aria-invalid={invalid ? true : ariaInvalid} bind:value></textarea>
