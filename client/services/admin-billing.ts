/** Admin-billing service — tier management, gateway config, subscription listings, and analytics. */
import { apiClient } from "@/lib/api"
import type {
  SubscriptionTier, 
  PaymentGateway, 
  GatewayConfig, 
  UserSubscription,
  UsageMetrics,
  BillingAuditLog 
} from "@/types/billing"

// Subscription Tiers
export async function getTiers(): Promise<SubscriptionTier[]> {
  return await apiClient<SubscriptionTier[]>("api/admin/billing/tiers")
}

export async function getTier(tierId: string): Promise<SubscriptionTier> {
  return await apiClient<SubscriptionTier>(`api/admin/billing/tiers/${tierId}`)
}

export async function createTier(tier: Omit<SubscriptionTier, "id" | "createdAt" | "updatedAt">): Promise<SubscriptionTier> {
  return await apiClient<SubscriptionTier>("api/admin/billing/tiers", { method: "POST", body: tier })
}

export async function updateTier(tierId: string, updates: Partial<SubscriptionTier>): Promise<SubscriptionTier> {
  return await apiClient<SubscriptionTier>(`api/admin/billing/tiers/${tierId}`, { method: "PUT", body: updates })
}

export async function deleteTier(tierId: string): Promise<void> {
  await apiClient<void>(`api/admin/billing/tiers/${tierId}`, { method: "DELETE" })
}

export async function reorderTiers(tierIds: string[]): Promise<void> {
  await apiClient<void>("api/admin/billing/tiers/reorder", { method: "POST", body: { tierIds } })
}

// Payment Gateways
export async function getGateways(): Promise<PaymentGateway[]> {
  return await apiClient<PaymentGateway[]>("api/admin/billing/gateways")
}

export async function getGatewayConfig(gatewayId: string): Promise<GatewayConfig> {
  return await apiClient<GatewayConfig>(`api/admin/billing/gateways/${gatewayId}/config`)
}

export async function updateGatewayConfig(gatewayId: string, config: GatewayConfig): Promise<GatewayConfig> {
  return await apiClient<GatewayConfig>(`api/admin/billing/gateways/${gatewayId}/config`, { method: "PUT", body: config })
}

export async function setActiveGateway(gatewayId: string): Promise<void> {
  await apiClient<void>(`api/admin/billing/gateways/${gatewayId}/activate`, { method: "POST" })
}

export async function toggleGatewayTestMode(gatewayId: string, testMode: boolean): Promise<void> {
  await apiClient<void>(`api/admin/billing/gateways/${gatewayId}/test-mode`, { method: "POST", body: { testMode } })
}

// User Subscriptions
export async function getUserSubscriptions(filters?: {
  tierId?: string
  status?: string
  page?: number
  limit?: number
}): Promise<{ subscriptions: UserSubscription[]; total: number; pages: number }> {
  const queryParams = new URLSearchParams()
  if (filters?.tierId) queryParams.append("tierId", filters.tierId)
  if (filters?.status) queryParams.append("status", filters.status)
  if (filters?.page) queryParams.append("page", filters.page.toString())
  if (filters?.limit) queryParams.append("limit", filters.limit.toString())
  
  const url = `api/admin/billing/subscriptions${queryParams.toString() ? `?${queryParams.toString()}` : ""}`
  return await apiClient<{ subscriptions: UserSubscription[]; total: number; pages: number }>(url)
}

export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  return await apiClient<UserSubscription | null>(`api/admin/billing/subscriptions/user/${userId}`)
}

export async function syncSubscription(subscriptionId: string): Promise<UserSubscription> {
  return await apiClient<UserSubscription>(`api/admin/billing/subscriptions/${subscriptionId}/sync`, { method: "POST" })
}

export async function overrideUserLimits(userId: string, limits: Partial<SubscriptionTier["limits"]>): Promise<void> {
  await apiClient<void>(`api/admin/billing/users/${userId}/limits`, { method: "POST", body: limits })
}

// Usage Metrics
export async function getUserUsage(userId: string): Promise<UsageMetrics> {
  return await apiClient<UsageMetrics>(`api/admin/billing/usage/${userId}`)
}

export async function getTierUsageStats(tierId: string): Promise<{
  totalUsers: number
  averageUsage: UsageMetrics["metrics"]
}> {
  return await apiClient<{
    totalUsers: number
    averageUsage: UsageMetrics["metrics"]
  }>(`api/admin/billing/tiers/${tierId}/usage`)
}

// Audit Logs
export async function getBillingAuditLogs(filters?: {
  adminId?: string
  resourceType?: string
  startDate?: Date
  endDate?: Date
  page?: number
  limit?: number
}): Promise<{ logs: BillingAuditLog[]; total: number }> {
  const queryParams = new URLSearchParams()
  if (filters?.adminId) queryParams.append("adminId", filters.adminId)
  if (filters?.resourceType) queryParams.append("resourceType", filters.resourceType)
  if (filters?.startDate) queryParams.append("startDate", filters.startDate.toISOString())
  if (filters?.endDate) queryParams.append("endDate", filters.endDate.toISOString())
  if (filters?.page) queryParams.append("page", filters.page.toString())
  if (filters?.limit) queryParams.append("limit", filters.limit.toString())
  
  const url = `api/admin/billing/audit-logs${queryParams.toString() ? `?${queryParams.toString()}` : ""}`
  return await apiClient<{ logs: BillingAuditLog[]; total: number }>(url)
}

// Analytics
export async function getBillingAnalytics(): Promise<{
  mrr: number
  arr: number
  churnRate: number
  tierDistribution: { tierId: string; tierName: string; count: number }[]
  revenueByTier: { tierId: string; tierName: string; revenue: number }[]
}> {
  return await apiClient<{
    mrr: number
    arr: number
    churnRate: number
    tierDistribution: { tierId: string; tierName: string; count: number }[]
    revenueByTier: { tierId: string; tierName: string; revenue: number }[]
  }>("api/admin/billing/analytics")
}
