import { apiClient } from "@/lib/api"

import type { BillingStorage, CheckoutSession, MyBilling, SubscriptionTier } from "@/lib/storage"

// ─── Billing (current user) ────────────────────────────────────────────────

export const billing: BillingStorage = {
  getMyBilling: () => apiClient<MyBilling>("billing/me"),
  getPublicTiers: () => apiClient<SubscriptionTier[]>("billing/tiers"),
  createCheckout: (tierId, seats) =>
    apiClient<CheckoutSession>("billing/checkout", { method: "POST", body: { tierId, seats } }),
}
