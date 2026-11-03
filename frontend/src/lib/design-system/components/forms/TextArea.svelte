<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";

  let {
    value = $bindable(),
    element = $bindable(),
    invalid = false,
    class: extraClass = "",
    "aria-invalid": ariaInvalid,
    ...rest
  }: {
    value?: string | undefined;
    element?: HTMLTextAreaElement | undefined;
    invalid?: boolean;
  } & Omit<HTMLTextareaAttributes, "value"> = $props();
</script>

<textarea {...rest} class={["seq-input", extraClass]} aria-invalid={invalid ? true : ariaInvalid} bind:value bind:this={element}></textarea>
