"use client"

import { useEffect, useState } from "react"
import { Check, CreditCard, Loader2, Sparkles, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { createCheckout, getMyBilling, getPublicTiers } from "@/services/billing"
import type { MyBilling, SubscriptionTier } from "@/types/billing"

const STATUS_LABELS: Record<MyBilling["status"], string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  canceled: "Canceled",
  none: "Free plan",
}

/** Formats a price in cents as a dollar string, dropping the decimals on whole amounts. */
function formatPrice(cents: number): string {
  if (cents <= 0) return "$0"
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

/** Formats an RFC3339 timestamp as a human date, or null if absent/invalid. */
function formatDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
}

/** Managed-AI monthly token usage with a progress bar. Unlimited tiers (-1)
 *  show the running total without a bar. */
function ManagedAIUsage({ billing }: { billing: MyBilling }) {
  const used = billing.aiTokensUsed
  const cap = billing.aiTokensPerMonth
  const unlimited = cap < 0
  const pct = unlimited || cap === 0 ? 0 : Math.min(100, Math.round((used / cap) * 100))
  return (
    <div className="mt-4 border-t pt-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Managed AI this month</span>
        <span className="font-medium">
          {used.toLocaleString()}
          {unlimited ? "" : ` / ${cap.toLocaleString()}`} tokens
        </span>
      </div>
      {!unlimited && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={pct >= 100 ? "h-full bg-destructive" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function BillingSection() {
  const [billing, setBilling] = useState<MyBilling | null>(null)
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [loading, setLoading] = useState(true)
  const [upgradingId, setUpgradingId] = useState<string | null>(null)
  const [seats, setSeats] = useState<Record<string, number>>({})
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")
  const { toast } = useToast()

  // Start a hosted checkout and redirect to it. While the payment gateway is
  // unconfigured the server returns FAILED_PRECONDITION, which we surface as a
  // friendly "not available yet" rather than an error.
  const handleUpgrade = async (tier: SubscriptionTier) => {
    setUpgradingId(tier.id)
    try {
      const seatCount = tier.perSeat ? Math.max(1, seats[tier.id] ?? 1) : undefined
      const { checkoutUrl } = await createCheckout(tier.id, seatCount, billingCycle)
      window.location.assign(checkoutUrl) // navigate away on success
    } catch (err) {
      const notReady = err instanceof ApiError && err.code === "FAILED_PRECONDITION"
      toast({
        title: notReady ? "Checkout isn't available yet" : "Couldn't start checkout",
        description: notReady
          ? "Paid plans aren't open for purchase yet. Check back soon."
          : err instanceof Error
            ? err.message
            : "Please try again.",
        variant: notReady ? "default" : "destructive",
      })
      setUpgradingId(null)
    }
  }

  useEffect(() => {
    let active = true
    Promise.allSettled([getMyBilling(), getPublicTiers()])
      .then(([b, t]) => {
        if (!active) return
        if (b.status === "fulfilled") setBilling(b.value)
        if (t.status === "fulfilled") setTiers(t.value)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const status = billing?.status ?? "none"
  const isPaid = !!billing && status !== "none" && billing.priceCents > 0
  const periodEnd = formatDate(billing?.currentPeriodEnd)

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>
            {isPaid ? "Your active subscription." : "You are on the free plan."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{billing?.tierName ?? "Free"}</span>
            <Badge variant="secondary">{STATUS_LABELS[status]}</Badge>
            {isPaid && (billing?.seats ?? 0) > 1 && (
              <Badge variant="outline">{billing?.seats} seats</Badge>
            )}
          </div>
          {periodEnd && (
            <p className="text-sm text-muted-foreground mt-1">
              {status === "canceled" ? `Access ends ${periodEnd}.` : `Renews ${periodEnd}.`}
            </p>
          )}
          {!isPaid && (
            <p className="text-sm text-muted-foreground mt-1">
              Paid plans with checkout are coming soon.
            </p>
          )}
          {billing && <ManagedAIUsage billing={billing} />}
        </CardContent>
      </Card>

      {/* Plan comparison — real tiers, current one marked */}
      {tiers.length > 0 && (
        <>
          <div className="flex justify-end">
            <div className="inline-flex rounded-md border bg-muted p-1" aria-label="Billing cycle">
              {(["monthly", "yearly"] as const).map(cycle => (
                <Button
                  key={cycle}
                  type="button"
                  size="sm"
                  variant={billingCycle === cycle ? "default" : "ghost"}
                  onClick={() => setBillingCycle(cycle)}
                >
                  {cycle === "monthly" ? "Monthly" : "Yearly"}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tiers.map(tier => {
            const isCurrent = tier.id === billing?.tierId
            const paid = tier.monthlyPriceCents > 0
            return (
              <Card key={tier.id} className={isCurrent ? "border-primary/40" : "opacity-90"}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {tier.perSeat ? (
                          <Users className="h-4 w-4 text-primary" />
                        ) : paid ? (
                          <Sparkles className="h-4 w-4 text-primary" />
                        ) : null}
                        {tier.name}
                      </CardTitle>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-bold">
                          {formatPrice(billingCycle === "yearly" ? tier.yearlyPriceCents : tier.monthlyPriceCents)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {paid
                            ? tier.perSeat
                              ? `/seat/${billingCycle === "yearly" ? "yr" : "mo"}`
                              : billingCycle === "yearly"
                                ? "/year"
                                : "/month"
                            : "forever"}
                        </span>
                      </div>
                    </div>
                    {isCurrent && (
                      <Badge variant="secondary" className="gap-1 shrink-0">
                        <Check className="h-3 w-3" /> Current
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {tier.description && (
                    <p className="text-sm text-muted-foreground mb-2">{tier.description}</p>
                  )}
                  <ul className="space-y-1.5">
                    {tier.featureBullets.map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && paid && tier.perSeat && (
                    <label className="mt-4 flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Seats</span>
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-20"
                        value={seats[tier.id] ?? 1}
                        onChange={e =>
                          setSeats(s => ({ ...s, [tier.id]: Math.max(1, Number(e.target.value) || 1) }))
                        }
                      />
                    </label>
                  )}
                  {!isCurrent && paid && (
                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      disabled={upgradingId !== null}
                      onClick={() => handleUpgrade(tier)}
                    >
                      {upgradingId === tier.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>Upgrade to {tier.name}</>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
            })}
          </div>
        </>
      )}

      {/* Payment / invoices — coming soon */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-muted p-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Payment &amp; Invoices</CardTitle>
              <CardDescription>Subscription checkout, payment method management, and invoice history</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <Badge variant="secondary" className="mb-3">Coming soon</Badge>
            <p>Subscription checkout, payment method management, and invoice downloads will appear here once billing goes live.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
