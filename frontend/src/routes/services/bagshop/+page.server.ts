import type { PageServerLoad } from "./$types";

import { createBagshopClient, type BagshopMe, type InventoryItem, type Order } from "$lib/api/bagshop";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  const client = createBagshopClient({ fetch });

  const inventoryResult = await client.getInventory();
  const inventory: InventoryItem[] = inventoryResult.ok ? inventoryResult.data : [];
  const inventoryError = inventoryResult.ok ? null : inventoryResult.error.message;

  let me: BagshopMe | null = null;
  let myOrders: Order[] = [];
  if (viewer) {
    const [meResult, ordersResult] = await Promise.all([client.getMe(), client.getMyOrders()]);
    if (meResult.ok) me = meResult.data;
    if (ordersResult.ok) myOrders = ordersResult.data;
  }

  return { viewer, inventory, inventoryError, me, myOrders };
};
