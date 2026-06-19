// Payment Gateway Abstraction Layer

export interface PaymentGateway {
  id: string
  name: string
  provider: "stripe" | "paddle" | "lemonsqueezy" | "paypal" | "custom"
  active: boolean
  testMode: boolean
}

export interface GatewayConfig {
  gatewayId: string
  credentials: {
    publicKey?: string
    secretKey?: string
    webhookSecret?: string
    [key: string]: string | undefined
  }
  webhooksEnabled: boolean
  settings: Record<string, unknown>
}

/**
 * A subscription tier as the billing model actually persists it. Mirrors the
 * gateway's tierDTO one-to-one. Only the fields the paywall enforces or bills
 * on are here — speculative fields (storage/themes/branding/overage rules) were
 * dropped; AI-token allowances arrive with managed AI, per-gateway price
 * mappings with the Paddle gateway.
 */
export interface SubscriptionTier {
  id: string
  name: string
  slug: string
  description: string
  /** Prices in minor units (cents). */
  monthlyPriceCents: number
  yearlyPriceCents: number
  displayOrder: number
  /** Whether the tier is selectable. */
  isActive: boolean
  /** Whether the tier shows on the public pricing page. */
  isPublic: boolean
  /** The tier applied to users with no subscription (delete-protected). */
  isDefault: boolean
  /** Billed per member (Business). */
  perSeat: boolean
  /** Enforced caps. -1 = unlimited for the numeric caps. */
  limits: {
    maxProjects: number
    maxCollaboratorsPerProject: number
    businessWorkspaces: boolean
  }
  /** Marketing bullet list shown on the pricing page (display only). */
  featureBullets: string[]
  // Server metadata (optional so CreateTierInput's Omit still type-checks).
  createdAt?: string
  updatedAt?: string
  subscriberCount?: number
}

export interface UserSubscription {
  id: string
  userId: string
  tierId: string
  gatewayId: string
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete"
  
  // Billing
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  billingCycle: "monthly" | "yearly"
  
  // Usage Tracking
  usage: {
    aiTokensUsed: number
    projectsCreated: number
    collaboratorsAdded: number
    storageUsedGB: number
  }
  
  // External References
  externalSubscriptionId?: string
  externalCustomerId?: string
  
  // Metadata
  createdAt: Date
  updatedAt: Date
  canceledAt?: Date
  trialEnd?: Date
}

// Gateway Interface that all providers must implement
export interface IGatewayProvider {
  // Initialize the gateway
  initialize(config: GatewayConfig): Promise<void>
  
  // Subscription Management
  createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult>
  updateSubscription(subscriptionId: string, params: UpdateSubscriptionParams): Promise<SubscriptionResult>
  cancelSubscription(subscriptionId: string, immediate: boolean): Promise<void>
  
  // Webhooks
  handleWebhook(payload: unknown, signature: string): Promise<WebhookResult>
  verifyWebhookSignature(payload: unknown, signature: string): boolean
  
  // Sync
  syncSubscriptionStatus(externalSubscriptionId: string): Promise<SubscriptionStatus>
  
  // Customer Management
  createCustomer(params: CreateCustomerParams): Promise<CustomerResult>
  updatePaymentMethod(customerId: string, paymentMethodId: string): Promise<void>
}

export interface CreateSubscriptionParams {
  customerId: string
  tierId: string
  priceId: string
  billingCycle: "monthly" | "yearly"
  trialDays?: number
}

export interface UpdateSubscriptionParams {
  tierId?: string
  priceId?: string
  billingCycle?: "monthly" | "yearly"
}

export interface SubscriptionResult {
  id: string
  status: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

export interface WebhookResult {
  type: string
  subscriptionId?: string
  status?: string
  handled: boolean
}

export interface SubscriptionStatus {
  status: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

export interface CreateCustomerParams {
  email: string
  name: string
  metadata?: Record<string, string>
}

export interface CustomerResult {
  id: string
  email: string
}

// Usage Tracking
export interface UsageMetrics {
  userId: string
  tierId: string
  period: {
    start: Date
    end: Date
  }
  metrics: {
    aiTokens: { used: number; limit: number | "unlimited" }
    projects: { used: number; limit: number | "unlimited" }
    collaborators: { used: number; limit: number | "unlimited" }
    storage: { used: number; limit: number | "unlimited" }
  }
}

// Audit Log
export interface BillingAuditLog {
  id: string
  adminId: string
  action: string
  resourceType: "tier" | "gateway" | "subscription" | "config"
  resourceId: string
  changes: Record<string, unknown>
  timestamp: Date
}
