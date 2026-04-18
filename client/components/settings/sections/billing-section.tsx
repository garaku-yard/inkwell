"use client"

import { CreditCard, Sparkles, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "Up to 3 projects",
      "All writing formats",
      "Beat board",
      "Basic collaboration",
      "Community support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$9.99",
    period: "per month",
    features: [
      "Unlimited projects",
      "AI Writing Buddy",
      "Priority support",
      "Private projects",
      "Advanced export formats",
      "Custom themes",
    ],
  },
  {
    id: "team",
    name: "Team",
    price: "$29.99",
    period: "per month",
    features: [
      "Everything in Pro",
      "Team workspaces",
      "Advanced permissions",
      "Dedicated support",
      "SSO integration",
    ],
  },
]

export function BillingSection() {
  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>You are on the Free plan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">Free</span>
            <Badge variant="secondary">Current</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Paid plans with checkout are coming soon.
          </p>
        </CardContent>
      </Card>

      {/* Plan comparison — informational only */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map(plan => (
          <Card key={plan.id} className={plan.id === "free" ? "border-primary/40" : "opacity-75"}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {plan.name === "Pro" && <Sparkles className="h-4 w-4 text-primary" />}
                    {plan.name === "Team" && <Users className="h-4 w-4 text-primary" />}
                    {plan.name}
                  </CardTitle>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold">{plan.price}</span>
                    <span className="text-xs text-muted-foreground">/{plan.period}</span>
                  </div>
                </div>
                {plan.id === "free" && (
                  <Badge variant="secondary" className="gap-1 shrink-0">
                    <Check className="h-3 w-3" /> Current
                  </Badge>
                )}
                {plan.id !== "free" && (
                  <Badge variant="outline" className="shrink-0">Coming soon</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

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
            <p>Stripe checkout, payment method management, and invoice downloads will appear here once billing goes live.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
