/** Admin billing service — thin wrappers around the Storage abstraction.
 *  Every call requires the hosted gateway (and a user with role=admin); the
 *  local/desktop Storage implementation rejects these with NotSupportedError. */
import { getStorage } from "@/lib/storage"
import type {
  SubscriptionTier,
  PaymentGateway,
  GatewayConfig,
  UserSubscription,
  UsageMetrics,
  BillingAuditLog,
} from "@/types/billing"

export const getTiers = (): Promise<SubscriptionTier[]> =>
  getStorage().admin.billing.getTiers()

export const getTier = (tierId: string): Promise<SubscriptionTier> =>
  getStorage().admin.billing.getTier(tierId)

export const createTier = (
  tier: Omit<SubscriptionTier, "id" | "createdAt" | "updatedAt">,
): Promise<SubscriptionTier> => getStorage().admin.billing.createTier(tier)

export const updateTier = (
  tierId: string,
  updates: Partial<SubscriptionTier>,
): Promise<SubscriptionTier> => getStorage().admin.billing.updateTier(tierId, updates)

export const deleteTier = (tierId: string): Promise<void> =>
  getStorage().admin.billing.deleteTier(tierId)

export const reorderTiers = (tierIds: string[]): Promise<void> =>
  getStorage().admin.billing.reorderTiers(tierIds)

export const getGateways = (): Promise<PaymentGateway[]> =>
  getStorage().admin.billing.getGateways()

export const getGatewayConfig = (gatewayId: string): Promise<GatewayConfig> =>
  getStorage().admin.billing.getGatewayConfig(gatewayId)

export const updateGatewayConfig = (
  gatewayId: string,
  config: GatewayConfig,
): Promise<GatewayConfig> => getStorage().admin.billing.updateGatewayConfig(gatewayId, config)

export const setActiveGateway = (gatewayId: string): Promise<void> =>
  getStorage().admin.billing.setActiveGateway(gatewayId)

export const toggleGatewayTestMode = (gatewayId: string, testMode: boolean): Promise<void> =>
  getStorage().admin.billing.toggleGatewayTestMode(gatewayId, testMode)

export const getUserSubscriptions = (filters?: {
  tierId?: string
  status?: string
  page?: number
  limit?: number
}): Promise<{ subscriptions: UserSubscription[]; total: number; pages: number }> =>
  getStorage().admin.billing.listUserSubscriptions(filters)

export const getUserSubscription = (userId: string): Promise<UserSubscription | null> =>
  getStorage().admin.billing.getUserSubscription(userId)

export const syncSubscription = (subscriptionId: string): Promise<UserSubscription> =>
  getStorage().admin.billing.syncSubscription(subscriptionId)

export const overrideUserLimits = (
  userId: string,
  limits: Partial<SubscriptionTier["limits"]>,
): Promise<void> => getStorage().admin.billing.overrideUserLimits(userId, limits)

export const getUserUsage = (userId: string): Promise<UsageMetrics> =>
  getStorage().admin.billing.getUserUsage(userId)

export const getTierUsageStats = (
  tierId: string,
): Promise<{ totalUsers: number; averageUsage: UsageMetrics["metrics"] }> =>
  getStorage().admin.billing.getTierUsageStats(tierId)

export const getBillingAuditLogs = (filters?: {
  adminId?: string
  resourceType?: string
  startDate?: Date
  endDate?: Date
  page?: number
  limit?: number
}): Promise<{ logs: BillingAuditLog[]; total: number }> =>
  getStorage().admin.billing.listAuditLogs(filters)

export const getBillingAnalytics = () => getStorage().admin.billing.getAnalytics()
