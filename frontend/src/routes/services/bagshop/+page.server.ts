import type { PageServerLoad } from "./$types";

import { createBagshopClient, type BagshopMe, type InventoryItem, type Order } from "$lib/api/bagshop";

export const prerender = false;

/**
 * Loads the public bag shop page: inventory for everyone, plus the signed-in viewer's
 * bag shop identity and their own orders. All bag shop calls fail soft so a bot outage
 * degrades to an empty listing with an error message rather than a 500.
 */
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  const client = createBagshopClient({ fetch });

  const inventoryResult = await client.getInventory();
  const inventory: InventoryItem[] = inventoryResult.ok ? inventoryResult.data : [];
  const inventoryError = inventoryResult.ok ? null : inventoryResult.error.message;

  let me: BagshopMe | null = null;
  let myOrders: Order[] = [];
  let ordersError: string | null = null;
  if (viewer) {
    const [meResult, ordersResult] = await Promise.all([client.getMe(), client.getMyOrders()]);
    if (meResult.ok) me = meResult.data;
    if (ordersResult.ok) myOrders = ordersResult.data;
    else ordersError = ordersResult.error.message;
  }

  return { viewer, inventory, inventoryError, me, myOrders, ordersError };
};
