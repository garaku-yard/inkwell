"use client"

import { useState } from "react"
import { CreditCard, Download, Check, Calendar } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

interface Invoice {
  id: string
  date: string
  amount: string
  status: "paid" | "pending" | "failed"
}

export function BillingSection() {
  const [currentPlan, setCurrentPlan] = useState("free")
  const [invoices] = useState<Invoice[]>([
    { id: "INV-001", date: "2024-01-01", amount: "$9.99", status: "paid" },
    { id: "INV-002", date: "2024-02-01", amount: "$9.99", status: "paid" },
    { id: "INV-003", date: "2024-03-01", amount: "$9.99", status: "pending" },
  ])
  const { toast } = useToast()

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "$0",
      period: "forever",
      features: [
        "Up to 3 projects",
        "Basic editor features",
        "Community support",
        "Public project sharing"
      ]
    },
    {
      id: "pro",
      name: "Pro",
      price: "$9.99",
      period: "per month",
      features: [
        "Unlimited projects",
        "Advanced editor features",
        "AI-powered suggestions",
        "Priority support",
        "Private projects",
        "Collaboration tools",
        "Export to multiple formats"
      ]
    },
    {
      id: "team",
      name: "Team",
      price: "$29.99",
      period: "per month",
      features: [
        "Everything in Pro",
        "Team workspace",
        "Advanced permissions",
        "Dedicated support",
        "Custom branding",
        "SSO integration"
      ]
    }
  ]

  const handleUpgrade = (planId: string) => {
    toast({ 
      title: "Redirecting to checkout", 
      description: "You'll be redirected to complete your purchase." 
    })
    // Redirect to Stripe checkout or similar
  }

  const handleCancelSubscription = () => {
    toast({ 
      title: "Subscription cancelled", 
      description: "Your subscription will remain active until the end of the billing period." 
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>
            Manage your subscription and billing information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-2xl font-bold capitalize">{currentPlan}</h3>
                <Badge variant={currentPlan === "free" ? "secondary" : "default"}>
                  {currentPlan === "free" ? "Current" : "Active"}
                </Badge>
              </div>
              {currentPlan === "free" ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Upgrade to unlock premium features and unlimited projects
                </p>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Next billing date: March 15, 2024 • $9.99/month
                </p>
              )}
            </div>
            {currentPlan !== "free" && (
              <Button variant="outline" onClick={handleCancelSubscription}>
                Cancel Subscription
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.id} className={plan.id === currentPlan ? "border-blue-500 dark:border-blue-600" : ""}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">/{plan.period}</span>
                  </div>
                </div>
                {plan.id === currentPlan && (
                  <Badge variant="default" className="gap-1">
                    <Check className="h-3 w-3" />
                    Current
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {plan.id !== currentPlan && (
                <Button 
                  className="w-full"
                  variant={plan.id === "pro" ? "default" : "outline"}
                  onClick={() => handleUpgrade(plan.id)}
                >
                  {plan.id === "free" ? "Downgrade" : "Upgrade"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {currentPlan !== "free" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Payment Method</CardTitle>
              <CardDescription>
                Manage how you pay for your subscription
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-2">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-medium">Visa ending in 4242</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Expires 12/2025
                    </p>
                  </div>
                </div>
                <Button variant="outline">Update</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>
                View and download your past invoices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="font-medium text-sm">{invoice.id}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{invoice.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{invoice.amount}</span>
                      <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "pending" ? "secondary" : "destructive"}>
                        {invoice.status}
                      </Badge>
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
