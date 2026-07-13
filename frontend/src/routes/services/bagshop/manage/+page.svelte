<script lang="ts">
  import { invalidateAll } from "$app/navigation";

  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Button from "$lib/design-system/components/Button.svelte";
  import Card from "$lib/design-system/components/Card.svelte";
  import SectionHeading from "$lib/design-system/components/SectionHeading.svelte";
  import { createBagshopClient, RARITIES, type Order } from "$lib/api/bagshop";
  import { groupInventoryByRaid } from "$lib/site/bagshop";
  import { pageView } from "$lib/site/nav";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const view = pageView("/services/bagshop");
  const client = createBagshopClient({ fetch });

  const groups = $derived(groupInventoryByRaid(data.inventory));

  let busy = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let declineReasons = $state<Record<string, string>>({});

  // Inventory editor drafts, keyed by inventory key.
  let drafts = $state<Record<string, { stock: string; price: string; cap: string }>>({});
  let savedKey = $state<string | null>(null);

  function draftFor(key: string, stock: number, price: number, cap: number) {
    return drafts[key] ?? { stock: String(stock), price: String(price), cap: String(cap) };
  }

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>) {
    busy = id;
    actionError = null;
    const result = await fn();
    busy = null;
    if (!result.ok && result.error) {
      actionError = result.error.code === "forbidden" ? "That action was rejected — you may not be allowed." : result.error.message;
      return;
    }
    await invalidateAll();
  }

  const claim = (order: Order) => run(`claim:${order.messageId}`, () => client.claimOrder(order.messageId));
  const fillAllItem = (order: Order, raid: string, rarity: string) =>
    run(`fill:${order.messageId}:${raid}:${rarity}`, () => client.fillItem(order.messageId, raid, rarity));

  function declineItem(order: Order, raid: string, rarity: string) {
    const reason = (declineReasons[order.messageId] ?? "").trim();
    return run(`decline:${order.messageId}:${raid}:${rarity}`, () => client.declineItem(order.messageId, raid, rarity, reason));
  }

  function declineOrder(order: Order) {
    const reason = (declineReasons[order.messageId] ?? "").trim();
    return run(`declineall:${order.messageId}`, () => client.declineOrder(order.messageId, reason));
  }

  async function saveInventory(key: string, stock: number, price: number, cap: number) {
    const draft = draftFor(key, stock, price, cap);
    const patch: Record<string, number> = {};
    const s = Number.parseInt(draft.stock, 10);
    const p = Number.parseInt(draft.price, 10);
    const c = Number.parseInt(draft.cap, 10);
    if (Number.isFinite(s) && s !== stock) patch.stock = s;
    if (Number.isFinite(p) && p !== price) patch.price = p;
    if (Number.isFinite(c) && c !== cap) patch.cap = c;
    if (Object.keys(patch).length === 0) return;

    busy = `inv:${key}`;
    actionError = null;
    const result = await client.patchInventory(key, patch);
    busy = null;
    if (!result.ok) {
      actionError = result.error.code === "forbidden" ? "Inventory edits are restricted to shop staff." : result.error.message;
      return;
    }
    savedKey = key;
    delete drafts[key];
    await invalidateAll();
  }
</script>

<PageScaffold crumbs={[...view.crumbs, { label: "Manage" }]} width="xl">
  {#snippet children()}
    <PageHeader kicker="Bag shop · Staff" title="Manage" lead="Claim, fill and decline orders, and edit stock, prices and caps." />

    {#if actionError}
      <p class="mg-error">{actionError}</p>
    {/if}

    <!-- ─── Open orders ───────────────────────────────────────────────── -->
    <section class="mg-section">
      <SectionHeading kicker="Queue" align="left">Open orders</SectionHeading>
      {#if data.openOrders.length === 0}
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
                          disabled={busy === `fill:${order.messageId}:${item.raid}:${item.rarity}`}
                          onclick={() => fillAllItem(order, item.raid, item.rarity)}
                        >
                          Fill
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === `decline:${order.messageId}:${item.raid}:${item.rarity}`}
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
                  <span class="mg-field-label">Decline reason (shown to the customer)</span>
                  <input class="mg-text" bind:value={declineReasons[order.messageId]} placeholder="Reason" />
                </label>
              {/if}

              <div class="mg-order-foot">
                {#if !order.claimedByMention}
                  <Button size="sm" variant="primary" disabled={busy === `claim:${order.messageId}`} onclick={() => claim(order)}>
                    Claim
                  </Button>
                {:else}
                  <Button size="sm" variant="ghost" disabled={busy === `declineall:${order.messageId}`} onclick={() => declineOrder(order)}>
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
                    <td><input class="mg-num" type="number" min="0" bind:value={draft.stock} onchange={(e) => (drafts[cell.key] = { ...draft, stock: e.currentTarget.value })} /></td>
                    <td><input class="mg-num" type="number" min="0" bind:value={draft.price} onchange={(e) => (drafts[cell.key] = { ...draft, price: e.currentTarget.value })} /></td>
                    <td><input class="mg-num" type="number" min="0" bind:value={draft.cap} onchange={(e) => (drafts[cell.key] = { ...draft, cap: e.currentTarget.value })} /></td>
                    <td>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === `inv:${cell.key}`}
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
  {/snippet}
</PageScaffold>

<style>
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
  .mg-field-label {
    font-family: var(--font-display);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }
  .mg-text,
  .mg-num {
    padding: 0.4rem 0.55rem;
    background: var(--color-abyss);
    border: 1px solid var(--color-border-subtle);
    border-radius: 0.35rem;
    color: var(--color-text-primary);
    font-family: var(--font-mono);
  }
  .mg-text:focus,
  .mg-num:focus {
    outline: none;
    border-color: var(--color-gold);
  }
  .mg-num {
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
