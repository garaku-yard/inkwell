import type { AdminBillingStorage } from "@/lib/storage"
import { reject } from "./shared"

// ─── Admin billing — not supported locally ───────────────────────────────

export const adminBilling: AdminBillingStorage = {
  getTiers: () => reject("admin"),
  getTier: () => reject("admin"),
  createTier: () => reject("admin"),
  updateTier: () => reject("admin"),
  deleteTier: () => reject("admin"),
  reorderTiers: () => reject("admin"),
  getGateways: () => reject("admin"),
  getGatewayConfig: () => reject("admin"),
  updateGatewayConfig: () => reject("admin"),
  setActiveGateway: () => reject("admin"),
  toggleGatewayTestMode: () => reject("admin"),
  listUserSubscriptions: () => reject("admin"),
  getUserSubscription: () => reject("admin"),
  syncSubscription: () => reject("admin"),
  overrideUserLimits: () => reject("admin"),
  getUserUsage: () => reject("admin"),
  getTierUsageStats: () => reject("admin"),
  listAuditLogs: () => reject("admin"),
  getAnalytics: () => reject("admin"),
}
