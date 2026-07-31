/**
 * One access vocabulary for every management area, regardless of how the
 * area authorizes (guild roster rank, bot staff flag, website admin):
 * - "granted": full access to the area
 * - "signin": no session - the viewer must sign in first
 * - "unverified": the authority is unreachable right now; retryable, fails closed
 * - "denied": signed in but not authorized
 */
export type AreaAccess = "granted" | "signin" | "unverified" | "denied";

/** Per-area access for the management console, resolved once per request. */
export interface ManageCapabilities {
  events: AreaAccess;
  bagshop: AreaAccess;
}

export type ManageAreaId = keyof ManageCapabilities;
