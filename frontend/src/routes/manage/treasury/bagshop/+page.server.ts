import type { PageServerLoad } from "./$types";

import { pageAreaAccess } from "#lib/server/manageCapabilities.js";
import { createBagshopClient, type InventoryItem, type Order } from "#lib/api/bagshop.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  const access = await pageAreaAccess(fetch, viewer, "treasury");
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
