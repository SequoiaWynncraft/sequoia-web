import type { PageServerLoad } from "./$types";

import { pageAreaAccess } from "$lib/server/manageCapabilities";
import { createBagshopClient, type InventoryItem, type Order } from "$lib/api/bagshop";

export const prerender = false;

/**
 * The staff panel: access comes from the console layout's capabilities; the
 * load only fetches panel data once granted. Mutations go through the bot,
 * which re-rejects non-staff itself, so the gate here is presentation.
 */
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  // Re-resolved per page load: the console layout's capabilities are cached
  // across child navigations, so they must not gate protected data here.
  const access = await pageAreaAccess(fetch, viewer, "bagshop");
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
