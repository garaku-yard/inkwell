/** Current-user billing service — thin wrappers around the Storage abstraction.
 *  Reads the signed-in account's own tier and the public plan list. The
 *  operator-facing tier/subscription management lives in `admin-billing.ts`. */
import { getStorage } from "@/lib/storage"
import type { MyBilling, SubscriptionTier } from "@/types/billing"

/** The signed-in user's effective tier and subscription status. Always resolves
 *  a tier (the default Free tier when there is no subscription). */
export const getMyBilling = (): Promise<MyBilling> => getStorage().billing.getMyBilling()

/** Active, public tiers for the Settings → Billing plan comparison. */
export const getPublicTiers = (): Promise<SubscriptionTier[]> =>
  getStorage().billing.getPublicTiers()
