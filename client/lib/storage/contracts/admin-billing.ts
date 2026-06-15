import type {
  BillingAuditLog,
  GatewayConfig,
  PaymentGateway,
  SubscriptionTier,
  UsageMetrics,
  UserSubscription,
} from "@/types/billing"

// ─── Admin (remote-only) ──────────────────────────────────────────────────

/** Input accepted by {@link AdminBillingStorage.createTier}. Matches the
 *  wire shape: every tier field except server-generated id + timestamps. */
export type CreateTierInput = Omit<SubscriptionTier, "id" | "createdAt" | "updatedAt">

/** Shape returned by {@link AdminBillingStorage.getAnalytics}. The server
 *  hands back labelled arrays rather than keyed records so the UI can render
 *  them without an extra lookup. */
export interface BillingAnalytics {
  /** Monthly recurring revenue in USD cents. */
  mrr: number
  /** Annual recurring revenue in USD cents. */
  arr: number
  /** Churn rate as a decimal fraction (e.g. 0.05 = 5%). */
  churnRate: number
  /** Subscriber count per tier. */
  tierDistribution: { tierId: string; tierName: string; count: number }[]
  /** Revenue per tier in USD cents. */
  revenueByTier: { tierId: string; tierName: string; revenue: number }[]
}

export interface AdminBillingStorage {
  getTiers(): Promise<SubscriptionTier[]>
  getTier(tierId: string): Promise<SubscriptionTier>
  createTier(tier: CreateTierInput): Promise<SubscriptionTier>
  updateTier(tierId: string, patch: Partial<SubscriptionTier>): Promise<SubscriptionTier>
  deleteTier(tierId: string): Promise<void>
  reorderTiers(tierIds: string[]): Promise<void>

  getGateways(): Promise<PaymentGateway[]>
  getGatewayConfig(gatewayId: string): Promise<GatewayConfig>
  updateGatewayConfig(gatewayId: string, config: GatewayConfig): Promise<GatewayConfig>
  setActiveGateway(gatewayId: string): Promise<void>
  toggleGatewayTestMode(gatewayId: string, testMode: boolean): Promise<void>

  listUserSubscriptions(filters?: Record<string, unknown>): Promise<{
    subscriptions: UserSubscription[]
    total: number
    pages: number
  }>
  getUserSubscription(userId: string): Promise<UserSubscription | null>
  syncSubscription(subscriptionId: string): Promise<UserSubscription>
  overrideUserLimits(userId: string, limits: Record<string, unknown>): Promise<void>
  getUserUsage(userId: string): Promise<UsageMetrics>
  getTierUsageStats(tierId: string): Promise<{ totalUsers: number; averageUsage: UsageMetrics["metrics"] }>
  listAuditLogs(filters?: Record<string, unknown>): Promise<{ logs: BillingAuditLog[]; total: number }>
  getAnalytics(): Promise<BillingAnalytics>
}
