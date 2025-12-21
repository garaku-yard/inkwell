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
  settings: Record<string, any>
}

export interface SubscriptionTier {
  id: string
  name: string
  slug: string
  description: string
  price: {
    monthly: number
    yearly: number
    currency: string
  }
  status: "active" | "inactive" | "archived"
  displayOrder: number
  
  // Usage Limits
  limits: {
    aiTokens: number | "unlimited"
    maxProjects: number | "unlimited"
    maxCollaborators: number | "unlimited"
    storageGB: number | "unlimited"
  }
  
  // Feature Access
  features: {
    availableThemes: string[]
    aiFeatures: boolean
    collaborationEnabled: boolean
    exportFormats: string[]
    prioritySupport: boolean
    customBranding: boolean
  }
  
  // Behavioral Rules
  rules: {
    limitType: "soft" | "hard"
    overageHandling: "block" | "throttle" | "charge"
    trialDays?: number
    gracePeriodDays?: number
  }
  
  // Gateway Mappings
  gatewayMappings: {
    [gatewayId: string]: {
      productId: string
      monthlyPriceId: string
      yearlyPriceId: string
    }
  }
  
  // Metadata
  createdAt: Date
  updatedAt: Date
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
  handleWebhook(payload: any, signature: string): Promise<WebhookResult>
  verifyWebhookSignature(payload: any, signature: string): boolean
  
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
  changes: Record<string, any>
  timestamp: Date
}
