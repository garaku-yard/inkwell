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

// ─── Subscription Tiers ───────────────────────────────────────────────────────

/**
 * Fetches all subscription tiers visible in the admin panel.
 *
 * @returns A promise that resolves to the list of tiers.
 * @throws {Error} When the caller does not have the admin role.
 */
export async function getTiers(): Promise<SubscriptionTier[]> {
  return await apiClient<SubscriptionTier[]>("api/admin/billing/tiers")
}

/**
 * Fetches a single subscription tier by its UUID.
 *
 * @param tierId - UUID of the tier to retrieve.
 * @returns A promise that resolves to the tier.
 * @throws {Error} When the tier is not found.
 */
export async function getTier(tierId: string): Promise<SubscriptionTier> {
  return await apiClient<SubscriptionTier>(`api/admin/billing/tiers/${tierId}`)
}

/**
 * Creates a new subscription tier.
 *
 * @param tier - All tier fields except `id`, `createdAt`, and `updatedAt`.
 * @returns A promise that resolves to the newly created tier.
 * @throws {Error} When a tier with the same name already exists.
 *
 * @example
 * ```ts
 * const tier = await createTier({ name: "Pro", monthlyPrice: 19, limits: { max_projects: 50 }, features: {} });
 * ```
 */
export async function createTier(tier: Omit<SubscriptionTier, "id" | "createdAt" | "updatedAt">): Promise<SubscriptionTier> {
  return await apiClient<SubscriptionTier>("api/admin/billing/tiers", { method: "POST", body: tier })
}

/**
 * Applies partial updates to a subscription tier. Only fields present in
 * `updates` are changed.
 *
 * @param tierId - UUID of the tier to update.
 * @param updates - Partial tier fields to change.
 * @returns A promise that resolves to the updated tier.
 */
export async function updateTier(tierId: string, updates: Partial<SubscriptionTier>): Promise<SubscriptionTier> {
  return await apiClient<SubscriptionTier>(`api/admin/billing/tiers/${tierId}`, { method: "PUT", body: updates })
}

/**
 * Permanently deletes a subscription tier. Existing subscribers on this tier
 * should be migrated before calling this.
 *
 * @param tierId - UUID of the tier to delete.
 * @returns A promise that resolves when the deletion is complete.
 */
export async function deleteTier(tierId: string): Promise<void> {
  await apiClient<void>(`api/admin/billing/tiers/${tierId}`, { method: "DELETE" })
}

/**
 * Updates the display order of all tiers. The array must contain every tier ID.
 *
 * @param tierIds - All tier UUIDs in the desired display order.
 * @returns A promise that resolves when the reorder is complete.
 */
export async function reorderTiers(tierIds: string[]): Promise<void> {
  await apiClient<void>("api/admin/billing/tiers/reorder", { method: "POST", body: { tierIds } })
}

// ─── Payment Gateways ─────────────────────────────────────────────────────────

/**
 * Fetches all configured payment gateways (e.g. Stripe, Paddle).
 *
 * @returns A promise that resolves to the list of gateways.
 */
export async function getGateways(): Promise<PaymentGateway[]> {
  return await apiClient<PaymentGateway[]>("api/admin/billing/gateways")
}

/**
 * Fetches the configuration for a specific payment gateway.
 *
 * @param gatewayId - UUID of the gateway.
 * @returns A promise that resolves to the gateway configuration.
 */
export async function getGatewayConfig(gatewayId: string): Promise<GatewayConfig> {
  return await apiClient<GatewayConfig>(`api/admin/billing/gateways/${gatewayId}/config`)
}

/**
 * Saves the configuration for a payment gateway (e.g. API keys, webhook URLs).
 *
 * @param gatewayId - UUID of the gateway to configure.
 * @param config - Full configuration object to persist.
 * @returns A promise that resolves to the saved configuration.
 */
export async function updateGatewayConfig(gatewayId: string, config: GatewayConfig): Promise<GatewayConfig> {
  return await apiClient<GatewayConfig>(`api/admin/billing/gateways/${gatewayId}/config`, { method: "PUT", body: config })
}

/**
 * Sets a gateway as the active payment processor. Only one gateway may be
 * active at a time.
 *
 * @param gatewayId - UUID of the gateway to activate.
 * @returns A promise that resolves when the gateway is active.
 */
export async function setActiveGateway(gatewayId: string): Promise<void> {
  await apiClient<void>(`api/admin/billing/gateways/${gatewayId}/activate`, { method: "POST" })
}

/**
 * Toggles test mode on or off for a payment gateway. In test mode, real
 * charges are not processed.
 *
 * @param gatewayId - UUID of the gateway.
 * @param testMode - `true` to enable test mode, `false` to use live mode.
 * @returns A promise that resolves when the mode has been updated.
 */
export async function toggleGatewayTestMode(gatewayId: string, testMode: boolean): Promise<void> {
  await apiClient<void>(`api/admin/billing/gateways/${gatewayId}/test-mode`, { method: "POST", body: { testMode } })
}

// ─── User Subscriptions ───────────────────────────────────────────────────────

/**
 * Fetches a paginated list of user subscriptions with optional filters.
 *
 * @param filters - Optional tier ID, status, page number, and items per page.
 * @returns A promise that resolves to the paginated subscription list with totals.
 *
 * @example
 * ```ts
 * const { subscriptions, total } = await getUserSubscriptions({ status: "active", page: 1, limit: 20 });
 * ```
 */
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

/**
 * Fetches the active subscription for a specific user.
 *
 * @param userId - UUID of the user.
 * @returns A promise that resolves to the subscription, or `null` if the user
 *   has no active subscription.
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  return await apiClient<UserSubscription | null>(`api/admin/billing/subscriptions/user/${userId}`)
}

/**
 * Syncs a subscription's status with the payment gateway, resolving any
 * discrepancies between the local record and the gateway's state.
 *
 * @param subscriptionId - UUID of the subscription to sync.
 * @returns A promise that resolves to the updated subscription record.
 */
export async function syncSubscription(subscriptionId: string): Promise<UserSubscription> {
  return await apiClient<UserSubscription>(`api/admin/billing/subscriptions/${subscriptionId}/sync`, { method: "POST" })
}

/**
 * Overrides the usage limits for a specific user, bypassing their subscription
 * tier's defaults. Useful for granting exceptions or enforcing custom limits.
 *
 * @param userId - UUID of the user.
 * @param limits - Partial limits object with the fields to override.
 * @returns A promise that resolves when the override is applied.
 */
export async function overrideUserLimits(userId: string, limits: Partial<SubscriptionTier["limits"]>): Promise<void> {
  await apiClient<void>(`api/admin/billing/users/${userId}/limits`, { method: "POST", body: limits })
}

// ─── Usage Metrics ────────────────────────────────────────────────────────────

/**
 * Fetches usage metrics for a specific user (projects created, collaborators
 * added, AI requests made, etc.).
 *
 * @param userId - UUID of the user.
 * @returns A promise that resolves to the user's usage metrics.
 */
export async function getUserUsage(userId: string): Promise<UsageMetrics> {
  return await apiClient<UsageMetrics>(`api/admin/billing/usage/${userId}`)
}

/**
 * Fetches aggregate usage statistics for all users on a given tier.
 *
 * @param tierId - UUID of the subscription tier.
 * @returns A promise that resolves to total user count and average usage metrics.
 */
export async function getTierUsageStats(tierId: string): Promise<{
  totalUsers: number
  averageUsage: UsageMetrics["metrics"]
}> {
  return await apiClient<{
    totalUsers: number
    averageUsage: UsageMetrics["metrics"]
  }>(`api/admin/billing/tiers/${tierId}/usage`)
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

/**
 * Fetches a paginated list of billing audit log entries, optionally filtered
 * by admin, resource type, or date range.
 *
 * @param filters - Optional admin ID, resource type, date range, and pagination.
 * @returns A promise that resolves to the log entries and total count.
 *
 * @example
 * ```ts
 * const { logs } = await getBillingAuditLogs({ resourceType: "tier", page: 1 });
 * ```
 */
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

// ─── Analytics ────────────────────────────────────────────────────────────────

/**
 * Fetches high-level billing analytics: MRR, ARR, churn rate, and revenue
 * broken down by subscription tier.
 *
 * Note: the backend currently returns stub/hardcoded data for this endpoint.
 *
 * @returns A promise that resolves to the billing analytics summary.
 *   `mrr` and `arr` are in USD cents.
 *
 * @example
 * ```ts
 * const { mrr, churnRate } = await getBillingAnalytics();
 * console.log(`MRR: $${(mrr / 100).toFixed(2)}`);
 * ```
 */
export async function getBillingAnalytics(): Promise<{
  /** Monthly recurring revenue in USD cents. */
  mrr: number
  /** Annual recurring revenue in USD cents. */
  arr: number
  /** Churn rate as a decimal fraction (e.g. `0.05` = 5%). */
  churnRate: number
  /** Number of subscribers per tier. */
  tierDistribution: { tierId: string; tierName: string; count: number }[]
  /** Revenue per tier in USD cents. */
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
