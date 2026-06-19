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
}
