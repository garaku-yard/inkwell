import type { MyBilling, SubscriptionTier } from "@/types/billing"

// ─── Billing (current user) ────────────────────────────────────────────────

/**
 * Current-user billing reads — the signed-in account's own tier and the public
 * plan list shown in Settings → Billing. Distinct from {@link AdminBillingStorage},
 * which is the operator-facing tier/subscription management surface.
 *
 * Remote-only in practice: the desktop build has no hosted account, so its
 * implementation reports the default Free tier and an empty plan list.
 */
export interface BillingStorage {
  /** The signed-in user's effective tier and subscription status. */
  getMyBilling(): Promise<MyBilling>
  /** Active, public tiers for the plan comparison, lowest display order first. */
  getPublicTiers(): Promise<SubscriptionTier[]>
  /**
   * Starts a hosted checkout for a tier and resolves the URL to redirect the
   * user to. seats applies to per-seat tiers (Business) and is ignored by flat
   * tiers; billingCycle defaults to monthly. Throws `ApiError` with code `FAILED_PRECONDITION` when no payment
   * gateway is configured yet (checkout not available). Not supported on desktop.
   */
  createCheckout(tierId: string, seats?: number, billingCycle?: "monthly" | "yearly"): Promise<CheckoutSession>
}

/** The result of starting a checkout — the hosted payment URL to navigate to. */
export interface CheckoutSession {
  checkoutUrl: string
}
