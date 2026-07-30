import type { PageServerLoad } from "./$types";

import { createBagshopClient, type InventoryItem, type Order } from "$lib/api/bagshop";

export const prerender = false;

/**
 * The staff panel: access comes from the console layout's capabilities; the
 * load only fetches panel data once granted. Mutations go through the bot,
 * which re-rejects non-staff itself, so the gate here is presentation.
 */
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { capabilities } = await parent();
  const access = capabilities.bagshop;
  if (access !== "granted") {
    return { access, openOrders: null, inventory: null, ordersError: null, inventoryError: null };
  }

  const client = createBagshopClient({ fetch });
  const [ordersResult, inventoryResult] = await Promise.all([
    client.getOpenOrders(),
    client.getInventory(),
  ]);
  return {
    access,
    openOrders: ordersResult.ok ? ordersResult.data : ([] as Order[]),
    inventory: inventoryResult.ok ? inventoryResult.data : ([] as InventoryItem[]),
    ordersError: ordersResult.ok ? null : ordersResult.error.message,
    inventoryError: inventoryResult.ok ? null : inventoryResult.error.message,
  };
};
