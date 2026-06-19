import { apiClient } from "@/lib/api"

import type { BillingStorage, MyBilling, SubscriptionTier } from "@/lib/storage"

// ─── Billing (current user) ────────────────────────────────────────────────

export const billing: BillingStorage = {
  getMyBilling: () => apiClient<MyBilling>("billing/me"),
  getPublicTiers: () => apiClient<SubscriptionTier[]>("billing/tiers"),
}
