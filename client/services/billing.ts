/** Current-user billing service — thin wrappers around the Storage abstraction.
 *  Reads the signed-in account's own tier and the public plan list. The
 *  operator-facing tier/subscription management lives in `admin-billing.ts`. */
import { getStorage } from "@/lib/storage"
import type { CheckoutSession } from "@/lib/storage"
import type { MyBilling, SubscriptionTier } from "@/types/billing"

/** The signed-in user's effective tier and subscription status. Always resolves
 *  a tier (the default Free tier when there is no subscription). */
export const getMyBilling = (): Promise<MyBilling> => getStorage().billing.getMyBilling()

/** Active, public tiers for the Settings → Billing plan comparison. */
export const getPublicTiers = (): Promise<SubscriptionTier[]> =>
  getStorage().billing.getPublicTiers()

/** Starts a hosted checkout for a tier, returning the URL to redirect to. seats
 *  applies to per-seat tiers (Business). Throws when no payment gateway is
 *  configured (checkout not available). */
export const createCheckout = (tierId: string, seats?: number): Promise<CheckoutSession> =>
  getStorage().billing.createCheckout(tierId, seats)
