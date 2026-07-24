<script lang="ts">
  import { currencyParts, formatEb } from "$lib/site/bagshop";
  import { CURRENCY_ASSET_BY_UNIT } from "$lib/site/currency";

  let { value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" } = $props();

  const parts = $derived(currencyParts(value));
</script>

<span class="currency currency-{size}" role="img" aria-label={formatEb(value)}>
  {#each parts as part (part.unit)}
    {@const asset = CURRENCY_ASSET_BY_UNIT[part.unit]}
    <span class="currency-part" aria-hidden="true">
      <span>{part.amount.toLocaleString("en-US")}</span>
      <img src={asset.url} alt="" title={asset.label} width="64" height="64" />
    </span>
  {/each}
</span>

<style>
  .currency {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    white-space: nowrap;
  }

  .currency-part {
    display: inline-flex;
    align-items: center;
    gap: 0.14em;
  }

  img {
    width: 1.35em;
    height: 1.35em;
    image-rendering: pixelated;
    object-fit: contain;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  .currency-sm {
    font-size: 0.92em;
  }

  .currency-lg {
    font-size: 1.15em;
  }
</style>
