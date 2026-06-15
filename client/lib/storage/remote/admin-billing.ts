import { apiClient } from "@/lib/api"

import type {
  AdminBillingStorage,
  BillingAnalytics,
  BillingAuditLog,
  CreateTierInput,
  GatewayConfig,
  PaymentGateway,
  SubscriptionTier,
  UsageMetrics,
  UserSubscription,
} from "@/lib/storage"

// ─── Admin billing ────────────────────────────────────────────────────────

export const adminBilling: AdminBillingStorage = {
  getTiers: () => apiClient<SubscriptionTier[]>("api/admin/billing/tiers"),
  getTier: (tierId) => apiClient<SubscriptionTier>(`api/admin/billing/tiers/${tierId}`),
  createTier: (tier: CreateTierInput) =>
    apiClient<SubscriptionTier>("api/admin/billing/tiers", { method: "POST", body: tier }),
  updateTier: (tierId, patch) =>
    apiClient<SubscriptionTier>(`api/admin/billing/tiers/${tierId}`, {
      method: "PUT",
      body: patch,
    }),
  deleteTier: async (tierId) => {
    await apiClient<void>(`api/admin/billing/tiers/${tierId}`, { method: "DELETE" })
  },
  reorderTiers: async (tierIds) => {
    await apiClient<void>("api/admin/billing/tiers/reorder", {
      method: "POST",
      body: { tierIds },
    })
  },

  getGateways: () => apiClient<PaymentGateway[]>("api/admin/billing/gateways"),
  getGatewayConfig: (gatewayId) =>
    apiClient<GatewayConfig>(`api/admin/billing/gateways/${gatewayId}/config`),
  updateGatewayConfig: (gatewayId, config) =>
    apiClient<GatewayConfig>(`api/admin/billing/gateways/${gatewayId}/config`, {
      method: "PUT",
      body: config,
    }),
  setActiveGateway: async (gatewayId) => {
    await apiClient<void>(`api/admin/billing/gateways/${gatewayId}/activate`, {
      method: "POST",
    })
  },
  toggleGatewayTestMode: async (gatewayId, testMode) => {
    await apiClient<void>(`api/admin/billing/gateways/${gatewayId}/test-mode`, {
      method: "POST",
      body: { testMode },
    })
  },

  listUserSubscriptions: (filters) => {
    const qs = new URLSearchParams()
    if (filters?.tierId) qs.append("tierId", String(filters.tierId))
    if (filters?.status) qs.append("status", String(filters.status))
    if (filters?.page) qs.append("page", String(filters.page))
    if (filters?.limit) qs.append("limit", String(filters.limit))
    const url = `api/admin/billing/subscriptions${qs.toString() ? `?${qs}` : ""}`
    return apiClient<{ subscriptions: UserSubscription[]; total: number; pages: number }>(url)
  },
  getUserSubscription: (userId) =>
    apiClient<UserSubscription | null>(`api/admin/billing/subscriptions/user/${userId}`),
  syncSubscription: (subscriptionId) =>
    apiClient<UserSubscription>(`api/admin/billing/subscriptions/${subscriptionId}/sync`, {
      method: "POST",
    }),
  overrideUserLimits: async (userId, limits) => {
    await apiClient<void>(`api/admin/billing/users/${userId}/limits`, {
      method: "POST",
      body: limits,
    })
  },
  getUserUsage: (userId) => apiClient<UsageMetrics>(`api/admin/billing/usage/${userId}`),
  getTierUsageStats: (tierId) =>
    apiClient<{ totalUsers: number; averageUsage: UsageMetrics["metrics"] }>(
      `api/admin/billing/tiers/${tierId}/usage`,
    ),
  listAuditLogs: (filters) => {
    const qs = new URLSearchParams()
    if (filters?.adminId) qs.append("adminId", String(filters.adminId))
    if (filters?.resourceType) qs.append("resourceType", String(filters.resourceType))
    if (filters?.startDate instanceof Date)
      qs.append("startDate", filters.startDate.toISOString())
    if (filters?.endDate instanceof Date)
      qs.append("endDate", filters.endDate.toISOString())
    if (filters?.page) qs.append("page", String(filters.page))
    if (filters?.limit) qs.append("limit", String(filters.limit))
    const url = `api/admin/billing/audit-logs${qs.toString() ? `?${qs}` : ""}`
    return apiClient<{ logs: BillingAuditLog[]; total: number }>(url)
  },
  getAnalytics: () => apiClient<BillingAnalytics>("api/admin/billing/analytics"),
}
