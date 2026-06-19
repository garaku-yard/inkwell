"use client"

import { useEffect, useState } from "react"
import { Check, CreditCard, Loader2, Sparkles, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getMyBilling, getPublicTiers } from "@/services/billing"
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

export function BillingSection() {
  const [billing, setBilling] = useState<MyBilling | null>(null)
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [loading, setLoading] = useState(true)

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
        </CardContent>
      </Card>

      {/* Plan comparison — real tiers, current one marked */}
      {tiers.length > 0 && (
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
                        <span className="text-2xl font-bold">{formatPrice(tier.monthlyPriceCents)}</span>
                        <span className="text-xs text-muted-foreground">
                          {paid ? (tier.perSeat ? "/seat/mo" : "/month") : "forever"}
                        </span>
                      </div>
                    </div>
                    {isCurrent ? (
                      <Badge variant="secondary" className="gap-1 shrink-0">
                        <Check className="h-3 w-3" /> Current
                      </Badge>
                    ) : paid ? (
                      <Badge variant="outline" className="shrink-0">Coming soon</Badge>
                    ) : null}
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
                </CardContent>
              </Card>
            )
          })}
        </div>
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
