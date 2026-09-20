<script lang="ts">
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";

  import { invalidateAll } from "$app/navigation";

  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import CurrencyAmount from "$lib/components/CurrencyAmount.svelte";
  import Button from "$lib/design-system/components/Button.svelte";
  import Card from "$lib/design-system/components/Card.svelte";
  import SectionHeading from "$lib/design-system/components/SectionHeading.svelte";
  import {
    createBagshopClient,
    RARITIES,
    splitInventoryKey,
    type OrderType,
    type PlacedOrder,
  } from "$lib/api/bagshop";
  import {
    groupInventoryByRaid,
    isCancellable,
    orderRemainingTotal,
    roundToLe,
  } from "$lib/site/bagshop";
  import { CURRENCY_ASSETS } from "$lib/site/currency";
  import { pageView } from "$lib/site/nav";
  import { webAuthStartUrl } from "$lib/site/webAuth";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const view = pageView("/services/bagshop");
  const client = createBagshopClient({ fetch });

  const groups = $derived(groupInventoryByRaid(data.inventory));

  // Order builder state. Number inputs bind as `number | null` (Svelte coerces them and
  // reports an empty field as null), so `amounts` is keyed to that, not strings.
  let orderType = $state<OrderType>("buy");
  let amounts = $state<Record<string, number | null>>({});
  let minecraftIgn = $state(untrack(() => data.viewer?.minecraftUsername ?? ""));
  let note = $state("");

  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let confirmation = $state<PlacedOrder | null>(null);

  // Message IDs with a cancel in flight — a Set so cancelling one order doesn't drop the
  // pending state of another the customer cancelled concurrently.
  const cancelling = new SvelteSet<string>();
  let cancelError = $state<string | null>(null);
  // Message ID whose Cancel button is awaiting an "Are you sure?" confirmation, or null.
  let confirmingCancel = $state<string | null>(null);

  const signedIn = $derived(data.viewer !== null);

  interface DraftLine {
    key: string;
    raid: string;
    rarity: string;
    amount: number;
    unit: number;
    total: number;
  }

  const draftLines = $derived.by<DraftLine[]>(() => {
    const lines: DraftLine[] = [];
    for (const item of data.inventory) {
      const amount = amounts[item.key];
      // Only whole positive quantities count — empty (null) and decimals are skipped.
      if (amount == null || !Number.isInteger(amount) || amount <= 0) continue;
      const { raid, rarity } = splitInventoryKey(item.key);
      const unit = orderType === "buy" ? item.buyPrice : item.sellPrice;
      lines.push({ key: item.key, raid, rarity, amount, unit, total: unit * amount });
    }
    return lines;
  });

  const rawTotal = $derived(draftLines.reduce((sum, line) => sum + line.total, 0));
  const roundedTotal = $derived(roundToLe(rawTotal, orderType));
  const MIN_LE = 32;

  // The most the shop could actually pay out for this draft. For buy orders the bot clamps
  // each line to current stock before checking the minimum, so a request for more bags than
  // exist is worth only what's in stock — mirror that so we can warn precisely instead of
  // telling the customer to "add more bags" they can't obtain. Sell offers aren't stock-capped.
  const achievableTotal = $derived.by(() => {
    if (orderType !== "buy") return roundedTotal;
    const stockByKey = new Map(data.inventory.map((item) => [item.key, item.stock]));
    let sum = 0;
    for (const line of draftLines) {
      const stock = stockByKey.get(line.key) ?? 0;
      sum += line.unit * Math.max(0, Math.min(line.amount, stock));
    }
    return roundToLe(sum, orderType);
  });

  // True when stock limits shrink the order below what the customer asked for — i.e. the shop
  // can't fully fill it. Used to explain a below-minimum draft the customer can't fix by adding more.
  const stockLimited = $derived(orderType === "buy" && achievableTotal < roundedTotal);
  const meetsMinimum = $derived(achievableTotal >= MIN_LE * 64);
  const canSubmit = $derived(
    signedIn && draftLines.length > 0 && minecraftIgn.trim().length > 0 && meetsMinimum && !submitting,
  );

  const ERROR_MESSAGES: Record<string, string> = {
    out_of_stock: "Everything you requested is out of stock right now.",
    all_capped: "Every bag type you offered has reached its cap and can't be sold right now.",
    below_minimum: "Orders must be worth at least 32 LE.",
    channel_unavailable: "The shop is briefly unavailable. Please try again in a moment.",
    unauthorized: "Your session expired. Please sign in again.",
    forbidden: "You're not allowed to do that.",
  };

  function friendly(code: string, fallback: string): string {
    return ERROR_MESSAGES[code] ?? fallback;
  }

  function switchType(next: OrderType) {
    if (orderType === next) return;
    orderType = next;
    confirmation = null;
    submitError = null;
  }

  async function submit() {
    if (!canSubmit) return;
    submitting = true;
    submitError = null;
    confirmation = null;
    const result = await client.placeOrder({
      orderType,
      minecraftIgn: minecraftIgn.trim(),
      note: note.trim() || undefined,
      items: draftLines.map((line) => ({ raid: line.raid, rarity: line.rarity, amount: line.amount })),
    });
    submitting = false;
    if (result.ok) {
      confirmation = result.data;
      amounts = {};
      note = "";
      await invalidateAll();
    } else {
      submitError = friendly(result.error.code, result.error.message);
    }
  }

  async function cancelOrder(messageId: string) {
    if (cancelling.has(messageId)) return;
    confirmingCancel = null;
    cancelling.add(messageId);
    cancelError = null;
    try {
      const result = await client.cancelOrder(messageId);
      if (result.ok) {
        await invalidateAll();
      } else {
        cancelError = friendly(result.error.code, result.error.message);
      }
    } finally {
      cancelling.delete(messageId);
    }
  }

  function orderTotal(order: (typeof data.myOrders)[number]): number | null {
    const priceByKey = new Map(
      data.inventory.map((item) => [item.key, order.orderType === "buy" ? item.buyPrice : item.sellPrice]),
    );
    const remaining = orderRemainingTotal(order, priceByKey);
    return remaining === null ? null : roundToLe(remaining, order.orderType);
  }

  function formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
</script>

<PageScaffold crumbs={view.crumbs} tabs={view.tabs} width="xl">
  {#snippet children()}
    <PageHeader kicker={view.kicker} title={view.title} lead={view.lead} />

    {#if data.me?.staff}
      <div class="bag-staff-banner">
        <span>You have staff access to the bag shop.</span>
        <Button href="/manage/treasury/bagshop" variant="secondary" size="sm">Open manage panel</Button>
      </div>
    {/if}

    {#if data.inventoryError}
      <Card hoverEffect={false}>
        <p class="bag-notice bag-notice-error">Couldn't load the shop inventory right now. Please try again shortly.</p>
      </Card>
    {/if}

    <!-- ─── Inventory ─────────────────────────────────────────────────── -->
    <section class="bag-section">
      <SectionHeading kicker="Marketplace" align="left">Current stock &amp; prices</SectionHeading>
      <p class="bag-section-lead">
        Buy price is what you pay per bag; sell price is what the shop pays you.
      </p>

      <div
        class="bag-currency-legend"
        role="img"
        aria-label="64 emeralds equal 1 emerald block; 64 emerald blocks equal 1 liquid emerald"
      >
        <span class="bag-currency-equation" aria-hidden="true">
          <span>64</span><img src={CURRENCY_ASSETS.emerald.url} alt="" width="64" height="64" />
          <span class="bag-currency-equals">=</span>
          <span>1</span><img src={CURRENCY_ASSETS.emeraldBlock.url} alt="" width="64" height="64" />
        </span>
        <span class="bag-currency-divider" aria-hidden="true"></span>
        <span class="bag-currency-equation" aria-hidden="true">
          <span>64</span><img src={CURRENCY_ASSETS.emeraldBlock.url} alt="" width="64" height="64" />
          <span class="bag-currency-equals">=</span>
          <span>1</span><img src={CURRENCY_ASSETS.liquidEmerald.url} alt="" width="64" height="64" />
        </span>
      </div>

      <div class="bag-table-scroll">
        <table class="bag-table">
          <thead>
            <tr>
              <th scope="col">Raid</th>
              {#each RARITIES as rarity (rarity)}
                <th scope="col" class="bag-col-{rarity.toLowerCase()}">{rarity}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each groups as group (group.raid)}
              <tr>
                <th scope="row" class="bag-raid-cell">{group.raid}</th>
                {#each RARITIES as rarity (rarity)}
                  {@const cell = group.items.find((item) => item.rarity === rarity)}
                  <td>
                    {#if cell}
                      <div class="bag-cell">
                        <span class="bag-cell-stock" class:bag-cell-out={cell.stock <= 0}>
                          {cell.stock} in stock
                        </span>
                        <span class="bag-cell-price">Buy <CurrencyAmount value={cell.buyPrice} size="sm" /></span>
                        <span class="bag-cell-price">Sell <CurrencyAmount value={cell.sellPrice} size="sm" /></span>
                        {#if cell.cap > 0}
                          <span class="bag-cell-cap">cap {cell.cap}</span>
                        {/if}
                      </div>
                    {:else}
                      <span class="bag-cell-empty">—</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <!-- ─── Order builder ─────────────────────────────────────────────── -->
    <section class="bag-section">
      <SectionHeading kicker="Place an order" align="left">Build your order</SectionHeading>

      {#if !signedIn}
        <Card hoverEffect={false}>
          <p class="bag-notice">Sign in with Discord to place a buy or sell order.</p>
          <Button href={webAuthStartUrl()} variant="primary">Sign in with Discord</Button>
        </Card>
      {:else}
        <div class="bag-mode-toggle" role="tablist" aria-label="Order type">
          <button
            role="tab"
            aria-selected={orderType === "buy"}
            class="bag-mode"
            class:bag-mode-active={orderType === "buy"}
            onclick={() => switchType("buy")}
          >
            Buy bags
          </button>
          <button
            role="tab"
            aria-selected={orderType === "sell"}
            class="bag-mode"
            class:bag-mode-active={orderType === "sell"}
            onclick={() => switchType("sell")}
          >
            Sell bags
          </button>
        </div>

        <div class="bag-table-scroll">
          <table class="bag-table bag-builder">
            <thead>
              <tr>
                <th scope="col">Raid</th>
                {#each RARITIES as rarity (rarity)}
                  <th scope="col" class="bag-col-{rarity.toLowerCase()}">{rarity}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each groups as group (group.raid)}
                <tr>
                  <th scope="row" class="bag-raid-cell">{group.raid}</th>
                  {#each RARITIES as rarity (rarity)}
                    {@const cell = group.items.find((item) => item.rarity === rarity)}
                    <td class="bag-amount-cell">
                      {#if cell}
                        <label class="bag-input-wrap">
                          <input
                            type="number"
                            min="0"
                            inputmode="numeric"
                            class="seq-input seq-input-mono"
                            placeholder="0"
                            aria-label="{orderType === 'buy' ? 'Buy' : 'Sell'} {group.raid} {rarity} amount"
                            bind:value={amounts[cell.key]}
                          />
                          <span class="bag-input-price">
                            <CurrencyAmount value={orderType === "buy" ? cell.buyPrice : cell.sellPrice} size="sm" />/ea
                          </span>
                        </label>
                      {:else}
                        <span class="bag-cell-empty">—</span>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="bag-form-grid">
          <label class="bag-field">
            <span class="seq-field-label">Minecraft IGN</span>
            <input class="seq-input" maxlength="16" bind:value={minecraftIgn} placeholder="Your in-game name" />
          </label>
          <label class="bag-field bag-field-wide">
            <span class="seq-field-label">Note (optional)</span>
            <input class="seq-input" maxlength="200" bind:value={note} placeholder="Anything staff should know" />
          </label>
        </div>

        <div class="bag-summary">
          <div class="bag-summary-total">
            <span class="bag-summary-label">Order total</span>
            <span class="bag-summary-value"><CurrencyAmount value={roundedTotal} size="lg" /></span>
          </div>
          <div class="bag-summary-actions">
            {#if draftLines.length > 0 && !meetsMinimum}
              {#if stockLimited}
                <span class="bag-hint">
                  We don't have that many bags in stock — even buying all we have comes to just
                  <CurrencyAmount value={achievableTotal} size="sm" />, below the {MIN_LE} LE minimum.
                </span>
              {:else}
                <span class="bag-hint">Minimum order is {MIN_LE} LE.</span>
              {/if}
            {/if}
            <Button variant="primary" disabled={!canSubmit} onclick={submit}>
              {submitting ? "Submitting…" : orderType === "buy" ? "Submit buy order" : "Submit sell offer"}
            </Button>
          </div>
        </div>

        {#if submitError}
          <p class="bag-notice bag-notice-error">{submitError}</p>
        {/if}

        {#if confirmation}
          <Card hoverEffect={false} style="margin-top:1rem">
            <p class="bag-confirm-title">
              {confirmation.merged ? "Added to your existing order" : "Order submitted"} — staff will reach out on Discord.
            </p>
            <ul class="bag-confirm-list">
              {#each confirmation.items as line (line.raid + line.rarity)}
                <li>
                  <span>{line.raid} · {line.rarity} × {line.amount}</span>
                  <span class="bag-mono"><CurrencyAmount value={line.total} /></span>
                </li>
              {/each}
            </ul>
            <p class="bag-confirm-total">
              <span>Combined total</span><span class="bag-mono"><CurrencyAmount value={confirmation.combinedTotal} /></span>
            </p>
            {#if confirmation.cappedNotice}
              <p class="bag-notice bag-notice-warn">{confirmation.cappedNotice}</p>
            {/if}
          </Card>
        {/if}
      {/if}
    </section>

    <!-- ─── Your orders ───────────────────────────────────────────────── -->
    {#if signedIn}
      <section class="bag-section">
        <SectionHeading kicker="Your activity" align="left">Your orders</SectionHeading>
        {#if cancelError}
          <p class="bag-notice bag-notice-error">{cancelError}</p>
        {/if}
        {#if data.ordersError}
          <Card hoverEffect={false}>
            <p class="bag-notice bag-notice-error">Couldn't load your orders right now. Please refresh in a moment before placing a new order.</p>
          </Card>
        {:else if data.myOrders.length === 0}
          <p class="bag-section-lead">You have no active orders.</p>
        {:else}
          <div class="bag-orders">
            {#each data.myOrders as order (order.messageId)}
              <Card hoverEffect={false}>
                <div class="bag-order-head">
                  <span class="bag-order-type bag-order-{order.orderType}">
                    {order.orderType === "buy" ? "Buy order" : "Sell offer"}
                  </span>
                  <span class="bag-order-status">
                    {order.claimedByMention ? "Claimed — in progress" : "Awaiting staff"}
                  </span>
                  <span class="bag-order-date">{formatDate(order.createdAt)}</span>
                </div>
                <ul class="bag-confirm-list">
                  {#each order.remainingItems as item (item.raid + item.rarity)}
                    <li><span>{item.raid} · {item.rarity} × {item.amount}</span></li>
                  {/each}
                  {#each order.processedItems as processed (processed.item.raid + processed.item.rarity + (processed.filled ? "f" : "d"))}
                    <li class="bag-processed">
                      <span>
                        {processed.filled ? "✅" : "❌"} {processed.item.raid} · {processed.item.rarity} × {processed.item.amount}
                        {#if !processed.filled && processed.declineReason}— {processed.declineReason}{/if}
                      </span>
                    </li>
                  {/each}
                </ul>
                <div class="bag-order-foot">
                  {#if order.remainingItems.length > 0}
                    {@const outstanding = orderTotal(order)}
                    {#if outstanding !== null}
                      <span class="bag-mono"><CurrencyAmount value={outstanding} /> outstanding</span>
                    {/if}
                  {/if}
                  {#if isCancellable(order) && order.remainingItems.length > 0}
                    {#if confirmingCancel === order.messageId}
                      <div class="bag-cancel-confirm">
                        <span class="bag-cancel-ask">Cancel this order?</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={cancelling.has(order.messageId)}
                          onclick={() => cancelOrder(order.messageId)}
                        >
                          {cancelling.has(order.messageId) ? "Cancelling…" : "Yes, cancel"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={cancelling.has(order.messageId)}
                          onclick={() => (confirmingCancel = null)}
                        >
                          Keep it
                        </Button>
                      </div>
                    {:else}
                      <Button variant="ghost" size="sm" onclick={() => (confirmingCancel = order.messageId)}>
                        Cancel
                      </Button>
                    {/if}
                  {/if}
                </div>
              </Card>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  {/snippet}
</PageScaffold>

<style>
  .bag-section {
    margin-top: 2.5rem;
  }
  .bag-section-lead {
    color: var(--color-text-secondary);
    max-width: 60ch;
    margin: 0.5rem 0 1.25rem;
    line-height: var(--leading-normal, 1.6);
  }
  .bag-staff-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 1.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: 0.5rem;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }

  .bag-table-scroll {
    overflow-x: auto;
  }
  .bag-currency-legend {
    display: inline-flex;
    align-items: center;
    gap: 0.85rem;
    margin: -0.35rem 0 1.25rem;
    padding: 0.45rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--color-emerald) 32%, var(--color-border-subtle));
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--color-emerald) 6%, var(--color-deep));
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }
  .bag-currency-equation {
    display: inline-flex;
    align-items: center;
    gap: 0.18rem;
  }
  .bag-currency-equation img {
    width: 1.5rem;
    height: 1.5rem;
    object-fit: contain;
    image-rendering: pixelated;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
  }
  .bag-currency-equals {
    margin: 0 0.3rem;
    color: var(--color-text-dim);
  }
  .bag-currency-divider {
    width: 1px;
    height: 1.4rem;
    background: var(--color-border-subtle);
  }
  .bag-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 40rem;
  }
  .bag-table th,
  .bag-table td {
    padding: 0.65rem 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--color-border-subtle);
    vertical-align: top;
  }
  .bag-table thead th {
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }
  .bag-raid-cell {
    font-family: var(--font-display);
    letter-spacing: 0.06em;
    color: var(--color-text-primary);
    white-space: nowrap;
  }
  .bag-col-unique {
    color: var(--rarity-unique, var(--color-gold));
  }
  .bag-col-rare {
    color: var(--rarity-rare, var(--color-diamond, #4fd0e0));
  }
  .bag-col-legendary {
    color: var(--rarity-legendary, var(--color-enchant));
  }

  .bag-cell {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.85rem;
  }
  .bag-cell-stock {
    color: var(--color-text-primary);
  }
  .bag-cell-out {
    color: var(--color-nether);
  }
  .bag-cell-price {
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }
  .bag-cell-cap {
    color: var(--color-text-dim);
    font-size: 0.72rem;
  }
  .bag-cell-empty {
    color: var(--color-text-dim);
  }

  .bag-mode-toggle {
    display: inline-flex;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: 0.5rem;
    background: var(--color-deep);
    margin-bottom: 1.25rem;
  }
  .bag-mode {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-display);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.5rem 1rem;
    border-radius: 0.35rem;
    cursor: pointer;
  }
  .bag-mode-active {
    background: var(--color-surface);
    color: var(--color-gold);
    box-shadow: var(--bevel-slot, inset 0 0 0 1px color-mix(in srgb, var(--color-gold) 35%, transparent));
  }

  .bag-input-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .bag-amount-cell {
    width: 5rem;
  }
  .bag-input-price {
    font-size: 0.7rem;
    color: var(--color-text-dim);
    font-family: var(--font-mono);
  }

  .bag-form-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 1.25rem;
  }
  .bag-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1 1 12rem;
  }
  .bag-field-wide {
    flex: 2 1 20rem;
  }
  .bag-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .bag-summary-label {
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-dim);
    margin-right: 0.6rem;
  }
  .bag-summary-value {
    font-family: var(--font-mono);
    font-size: 1.3rem;
    color: var(--color-gold);
  }
  .bag-summary-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .bag-hint {
    color: var(--color-text-dim);
    font-size: 0.8rem;
  }

  .bag-notice {
    color: var(--color-text-secondary);
    margin: 0 0 0.75rem;
    line-height: var(--leading-normal, 1.6);
    white-space: pre-line;
  }
  .bag-notice-error {
    color: var(--color-nether);
  }
  .bag-notice-warn {
    color: var(--color-gold);
    margin-top: 0.75rem;
    margin-bottom: 0;
  }

  .bag-confirm-title {
    font-family: var(--font-display);
    letter-spacing: 0.04em;
    color: var(--color-text-primary);
    margin: 0 0 0.75rem;
  }
  .bag-confirm-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .bag-confirm-list li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }
  .bag-processed {
    color: var(--color-text-dim);
  }
  .bag-confirm-total {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin: 0.75rem 0 0;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border-subtle);
    color: var(--color-text-primary);
  }
  .bag-mono {
    font-family: var(--font-mono);
    color: var(--color-gold);
  }

  .bag-orders {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: 1rem;
  }
  .bag-order-head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  .bag-order-type {
    font-family: var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 0.8rem;
  }
  .bag-order-buy {
    color: var(--color-diamond, #4fd0e0);
  }
  .bag-order-sell {
    color: var(--color-gold);
  }
  .bag-order-status {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }
  .bag-order-date {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--color-text-dim);
    font-family: var(--font-mono);
  }
  .bag-order-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.9rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border-subtle);
    font-size: 0.85rem;
  }
  .bag-cancel-confirm {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .bag-cancel-ask {
    color: var(--color-text-secondary);
    font-size: 0.8rem;
  }
</style>
