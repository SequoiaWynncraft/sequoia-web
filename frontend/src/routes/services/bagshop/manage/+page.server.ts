import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { createBagshopClient, type InventoryItem, type Order } from "$lib/api/bagshop";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  if (!viewer) throw redirect(302, "/services/bagshop");

  const client = createBagshopClient({ fetch });
  const me = await client.getMe();
  if (!me.ok || !me.data.staff) {
    throw error(403, "The bag shop manage panel is restricted to shop staff.");
  }

  const [ordersResult, inventoryResult] = await Promise.all([client.getOpenOrders(), client.getInventory()]);
  const openOrders: Order[] = ordersResult.ok ? ordersResult.data : [];
  const inventory: InventoryItem[] = inventoryResult.ok ? inventoryResult.data : [];

  return {
    openOrders,
    inventory,
    ordersError: ordersResult.ok ? null : ordersResult.error.message,
    inventoryError: inventoryResult.ok ? null : inventoryResult.error.message,
  };
};
