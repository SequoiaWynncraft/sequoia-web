<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { SvelteSet } from "svelte/reactivity";

  import Button from "$lib/design-system/components/Button.svelte";
  import Card from "$lib/design-system/components/Card.svelte";
  import SectionHeading from "$lib/design-system/components/SectionHeading.svelte";
  import { createBagshopClient, RARITIES, type Order } from "$lib/api/bagshop";
  import ManageGate from "$lib/manage/ManageGate.svelte";
  import ManageHeader from "$lib/manage/ManageHeader.svelte";
  import { groupInventoryByRaid } from "$lib/site/bagshop";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const client = createBagshopClient({ fetch });

  const groups = $derived(groupInventoryByRaid(data.inventory ?? []));

  // Message/inventory IDs with an action in flight — a Set so concurrent Fill/Decline/Save
  // actions keep independent pending state rather than clobbering one another.
  const busy = new SvelteSet<string>();
  let actionError = $state<string | null>(null);
  let declineReasons = $state<Record<string, string>>({});

  // Inventory editor drafts, keyed by inventory key.
  let drafts = $state<Record<string, { stock: string; price: string; cap: string }>>({});
  let savedKey = $state<string | null>(null);

  function draftFor(key: string, stock: number, price: number, cap: number) {
    return drafts[key] ?? { stock: String(stock), price: String(price), cap: String(cap) };
  }

  /** A per-order lock so a claim/fill/decline can't race another mutation on the same order. */
  const orderLock = (order: Order) => `order:${order.messageId}`;

  async function run(lockId: string, fn: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>) {
    // Serialize by resource: ignore a second action while one on the same order/row is in flight.
    if (busy.has(lockId)) return;
    busy.add(lockId);
    actionError = null;
    try {
      const result = await fn();
      if (!result.ok) {
        actionError =
          result.error?.code === "forbidden"
            ? "That action was rejected — you may not be allowed."
            : (result.error?.message ?? "That action failed. Please try again.");
        return;
      }
      await invalidateAll();
    } finally {
      busy.delete(lockId);
    }
  }

  const claim = (order: Order) => run(orderLock(order), () => client.claimOrder(order.messageId));
  const fillAllItem = (order: Order, raid: string, rarity: string) =>
    run(orderLock(order), () => client.fillItem(order.messageId, raid, rarity));

  function declineItem(order: Order, raid: string, rarity: string) {
    const reason = (declineReasons[order.messageId] ?? "").trim();
    return run(orderLock(order), () => client.declineItem(order.messageId, raid, rarity, reason));
  }

  function declineOrder(order: Order) {
    const reason = (declineReasons[order.messageId] ?? "").trim();
    return run(orderLock(order), () => client.declineOrder(order.messageId, reason));
  }

  /** Parses an inventory field: "" → unchanged (null), a non-negative integer → its value, anything else → invalid. */
  function parseInventoryField(raw: string): number | null | "invalid" {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    // Reject decimals, negatives and other malformed input rather than truncating with parseInt.
    if (!/^\d+$/.test(trimmed)) return "invalid";
    return Number(trimmed);
  }

  async function saveInventory(key: string, stock: number, price: number, cap: number) {
    const draft = draftFor(key, stock, price, cap);
    const s = parseInventoryField(draft.stock);
    const p = parseInventoryField(draft.price);
    const c = parseInventoryField(draft.cap);
    if (s === "invalid" || p === "invalid" || c === "invalid") {
      actionError = "Stock, price and cap must be whole numbers (0 or more).";
      return;
    }
    const patch: Record<string, number> = {};
    if (s !== null && s !== stock) patch.stock = s;
    if (p !== null && p !== price) patch.price = p;
    if (c !== null && c !== cap) patch.cap = c;
    if (Object.keys(patch).length === 0) return;

    const id = `inv:${key}`;
    if (busy.has(id)) return;
    busy.add(id);
    actionError = null;
    try {
      const result = await client.patchInventory(key, patch);
      if (!result.ok) {
        actionError = result.error.code === "forbidden" ? "Inventory edits are restricted to shop staff." : result.error.message;
        return;
      }
      savedKey = key;
      delete drafts[key];
      await invalidateAll();
    } finally {
      busy.delete(id);
    }
  }
</script>

<svelte:head>
  <title>Manage bag shop - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <ManageHeader
    area="Bag shop"
    title="Orders & stock"
    lead="Claim, fill and decline orders, and edit stock, prices and caps."
  />

  {#if data.access !== "granted"}
    <ManageGate
      access={data.access}
      returnTo="/manage/bagshop"
      title="Shop staff only"
      signinText="Sign in to manage the bag shop."
      deniedText="The bag shop panel is restricted to shop staff."
      backHref="/services/bagshop"
      backLabel="Back to the shop"
    />
  {:else}
    {#if actionError}
      <p class="mg-error">{actionError}</p>
    {/if}

    <!-- ─── Open orders ───────────────────────────────────────────────── -->
    <section class="mg-section">
      <SectionHeading kicker="Queue" align="left">Open orders</SectionHeading>
      {#if data.ordersError}
        <Card hoverEffect={false}>
          <p class="mg-error">Couldn't load the order queue right now. Please try again shortly.</p>
        </Card>
      {:else if data.openOrders.length === 0}
        <p class="mg-lead">No open orders right now.</p>
      {:else}
        <div class="mg-orders">
          {#each data.openOrders as order (order.messageId)}
            <Card hoverEffect={false}>
              <div class="mg-order-head">
                <span class="mg-type mg-type-{order.orderType}">{order.orderType === "buy" ? "Buy order" : "Sell offer"}</span>
                {#if order.splitPart > 0}<span class="mg-part">Part {order.splitPart}/2</span>{/if}
                <span class="mg-order-status">{order.claimedByMention ? "Claimed" : "Unclaimed"}</span>
              </div>
              <p class="mg-player">
                {order.userName || "Unknown"}{#if order.minecraftIgn} · IGN {order.minecraftIgn}{/if}
              </p>
              {#if order.note}<p class="mg-note">Note: {order.note}</p>{/if}

              <ul class="mg-items">
                {#each order.remainingItems as item (item.raid + item.rarity)}
                  <li>
                    <span>{item.raid} · {item.rarity} × {item.amount}</span>
                    {#if order.claimedByMention}
                      <span class="mg-item-actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy.has(`order:${order.messageId}`)}
                          onclick={() => fillAllItem(order, item.raid, item.rarity)}
                        >
                          Fill
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy.has(`order:${order.messageId}`)}
                          onclick={() => declineItem(order, item.raid, item.rarity)}
                        >
                          Decline
                        </Button>
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>

              {#if order.claimedByMention}
                <label class="mg-reason">
                  <span class="seq-field-label">Decline reason (shown to the customer)</span>
                  <input class="seq-input seq-input-mono" bind:value={declineReasons[order.messageId]} placeholder="Reason" />
                </label>
              {/if}

              <div class="mg-order-foot">
                {#if !order.claimedByMention}
                  <Button size="sm" variant="primary" disabled={busy.has(`order:${order.messageId}`)} onclick={() => claim(order)}>
                    Claim
                  </Button>
                {:else}
                  <Button size="sm" variant="ghost" disabled={busy.has(`order:${order.messageId}`)} onclick={() => declineOrder(order)}>
                    Decline all remaining
                  </Button>
                {/if}
              </div>
            </Card>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ─── Inventory editor ──────────────────────────────────────────── -->
    <section class="mg-section">
      <SectionHeading kicker="Inventory" align="left">Stock, prices &amp; caps</SectionHeading>
      <p class="mg-lead">Prices are in emerald blocks. A cap of 0 means no limit.</p>
      {#if data.inventoryError}
        <Card hoverEffect={false}>
          <p class="mg-error">Couldn't load the inventory right now. Please try again shortly.</p>
        </Card>
      {/if}
      <div class="mg-table-scroll">
        <table class="mg-table">
          <thead>
            <tr>
              <th scope="col">Bag</th>
              <th scope="col">Stock</th>
              <th scope="col">Sell price</th>
              <th scope="col">Cap</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {#each groups as group (group.raid)}
              {#each RARITIES as rarity (rarity)}
                {@const cell = group.items.find((item) => item.rarity === rarity)}
                {#if cell}
                  {@const draft = draftFor(cell.key, cell.stock, cell.sellPrice, cell.cap)}
                  <tr>
                    <th scope="row" class="mg-bag">{group.raid} · {rarity}</th>
                    <td class="mg-number-cell"><input class="seq-input seq-input-mono" type="number" min="0" bind:value={draft.stock} oninput={(e) => (drafts[cell.key] = { ...draft, stock: e.currentTarget.value })} /></td>
                    <td class="mg-number-cell"><input class="seq-input seq-input-mono" type="number" min="0" bind:value={draft.price} oninput={(e) => (drafts[cell.key] = { ...draft, price: e.currentTarget.value })} /></td>
                    <td class="mg-number-cell"><input class="seq-input seq-input-mono" type="number" min="0" bind:value={draft.cap} oninput={(e) => (drafts[cell.key] = { ...draft, cap: e.currentTarget.value })} /></td>
                    <td>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy.has(`inv:${cell.key}`)}
                        onclick={() => saveInventory(cell.key, cell.stock, cell.sellPrice, cell.cap)}
                      >
                        {savedKey === cell.key && !drafts[cell.key] ? "Saved" : "Save"}
                      </Button>
                    </td>
                  </tr>
                {/if}
              {/each}
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<style>
  .mg-page {
    padding-bottom: 48px;
  }
  .mg-section {
    margin-top: 2.5rem;
  }
  .mg-lead {
    color: var(--color-text-secondary);
    margin: 0.5rem 0 1.25rem;
  }
  .mg-error {
    color: var(--color-nether);
    margin: 1rem 0 0;
  }
  .mg-orders {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
    gap: 1rem;
  }
  .mg-order-head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }
  .mg-type {
    font-family: var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.8rem;
  }
  .mg-type-buy {
    color: var(--color-diamond, #4fd0e0);
  }
  .mg-type-sell {
    color: var(--color-gold);
  }
  .mg-part,
  .mg-order-status {
    font-size: 0.75rem;
    color: var(--color-text-dim);
  }
  .mg-player {
    color: var(--color-text-primary);
    margin: 0 0 0.25rem;
    font-size: 0.9rem;
  }
  .mg-note {
    color: var(--color-text-secondary);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .mg-items {
    list-style: none;
    margin: 0.5rem 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .mg-items li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }
  .mg-item-actions {
    display: flex;
    gap: 0.4rem;
  }
  .mg-reason {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0.5rem 0;
  }
  .mg-number-cell {
    width: 6rem;
  }
  .mg-order-foot {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .mg-table-scroll {
    overflow-x: auto;
  }
  .mg-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 36rem;
  }
  .mg-table th,
  .mg-table td {
    padding: 0.55rem 0.7rem;
    text-align: left;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .mg-table thead th {
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }
  .mg-bag {
    font-family: var(--font-display);
    letter-spacing: 0.04em;
    color: var(--color-text-primary);
    white-space: nowrap;
  }
</style>
