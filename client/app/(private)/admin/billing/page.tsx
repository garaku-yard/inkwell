"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, DollarSign, Users, TrendingUp, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/lib/AuthContext"
import { TiersManagement } from "@/components/admin/billing/tiers-management"
import { GatewayConfiguration } from "@/components/admin/billing/gateway-configuration"
import { SubscriptionsOverview } from "@/components/admin/billing/subscriptions-overview"
import { getBillingAnalytics } from "@/services/admin-billing"

export default function AdminBillingPage() {
  const { user } = useAuth()
  const router = useRouter()
  type BillingAnalytics = Awaited<ReturnType<typeof getBillingAnalytics>>
  const [analytics, setAnalytics] = useState<BillingAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check admin access
    if (user && user.role !== "admin") {
      router.push("/dashboard")
      return
    }

    loadAnalytics()
  }, [user, router])

  const loadAnalytics = async () => {
    try {
      const data = await getBillingAnalytics()
      setAnalytics(data)
    } catch (error) {
      console.error("Failed to load analytics")
    } finally {
      setIsLoading(false)
    }
  }

  // Block non-admin users
  if (user && user.role !== "admin") {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Admin Billing & Subscriptions
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Manage subscription tiers, payment gateways, and user subscriptions
          </p>
        </div>

        {/* Analytics Overview */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${analytics.mrr.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">+12% from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Annual Recurring Revenue</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${analytics.arr.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Projected ARR</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Subscribers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics.tierDistribution.reduce((sum, t) => sum + t.count, 0)}
                </div>
                <p className="text-xs text-muted-foreground">Across all tiers</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.churnRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="tiers" className="space-y-6">
          <TabsList>
            <TabsTrigger value="tiers">Subscription Tiers</TabsTrigger>
            <TabsTrigger value="gateways">Payment Gateways</TabsTrigger>
            <TabsTrigger value="subscriptions">User Subscriptions</TabsTrigger>
          </TabsList>

          <TabsContent value="tiers">
            <TiersManagement />
          </TabsContent>

          <TabsContent value="gateways">
            <GatewayConfiguration />
          </TabsContent>

          <TabsContent value="subscriptions">
            <SubscriptionsOverview />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
