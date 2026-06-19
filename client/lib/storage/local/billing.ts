import { NotSupportedError } from "@/lib/storage"
import type { BillingStorage, MyBilling } from "@/lib/storage"

// ─── Billing (current user) ────────────────────────────────────────────────

/**
 * Desktop billing is a no-op surface: the local build has no hosted account, so
 * the user is always on the free, local-first tier and there is no plan list to
 * upgrade to. Reporting Free (rather than throwing) lets the shared Settings UI
 * render unchanged on desktop.
 */
const FREE_TIER: MyBilling = {
  tierId: "",
  tierName: "Free",
  priceCents: 0,
  status: "none",
  seats: 0,
  maxProjects: -1,
  maxCollaboratorsPerProject: -1,
  aiFeaturesEnabled: false,
  prioritySupport: false,
}

export const billing: BillingStorage = {
  getMyBilling: async () => FREE_TIER,
  getPublicTiers: async () => [],
  createCheckout: async () => {
    throw new NotSupportedError("Checkout is only available in the hosted app")
  },
}
