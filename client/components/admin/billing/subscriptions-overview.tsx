"use client"

import { useState, useEffect } from "react"
import { Users, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { getUserSubscriptions, syncSubscription } from "@/services/admin-billing"
import type { UserSubscription } from "@/types/billing"

const PAGE_SIZE = 20

export function SubscriptionsOverview() {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const { toast } = useToast()

  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  useEffect(() => {
    loadSubscriptions()
  }, [page, statusFilter])

  const loadSubscriptions = async () => {
    try {
      setIsLoading(true)
      const filters: { page: number; limit: number; status?: string } = { page, limit: PAGE_SIZE }
      if (statusFilter !== "all") filters.status = statusFilter

      const data = await getUserSubscriptions(filters)
      setSubscriptions(data.subscriptions)
      setTotal(data.total)
    } catch (error) {
      toast({ title: "Failed to load subscriptions", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleSync = async (subscriptionId: string) => {
    try {
      await syncSubscription(subscriptionId)
      toast({ title: "Subscription synced", description: "Status updated from payment provider" })
      loadSubscriptions()
    } catch (error) {
      toast({ title: "Failed to sync", variant: "destructive" })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "default"
      case "trialing": return "secondary"
      case "past_due": return "destructive"
      case "canceled": return "outline"
      default: return "secondary"
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>User Subscriptions</CardTitle>
              <CardDescription>
                Monitor and manage all active subscriptions
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {total} Total
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Search by user email or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Loading subscriptions...</div>
          ) : subscriptions.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500">No subscriptions found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((subscription) => (
                <div
                  key={subscription.id}
                  className="flex items-start justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-800"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium">{subscription.userId}</h4>
                      <Badge variant={getStatusColor(subscription.status)}>
                        {subscription.status}
                      </Badge>
                      {subscription.cancelAtPeriodEnd && (
                        <Badge variant="outline">Canceling</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Tier:</span>{" "}
                        <span className="font-medium">{subscription.tierName ?? subscription.tierId}</span>
                      </div>
                      {(subscription.seats ?? 0) > 0 && (
                        <div>
                          <span className="text-gray-500">Seats:</span>{" "}
                          <span className="font-medium">{subscription.seats}</span>
                        </div>
                      )}
                      {subscription.currentPeriodEnd && (
                        <div>
                          <span className="text-gray-500">Period End:</span>{" "}
                          <span className="font-medium">
                            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex gap-4 text-xs">
                      <div>
                        <span className="text-gray-500">AI Tokens (mo):</span>{" "}
                        <span className="font-medium">{(subscription.usage?.aiTokensUsed ?? 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Projects:</span>{" "}
                        <span className="font-medium">{subscription.usage?.projectsCreated ?? 0}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Collaborators:</span>{" "}
                        <span className="font-medium">{subscription.usage?.collaboratorsAdded ?? 0}</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSync(subscription.id)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!isLoading && total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages} · {total.toLocaleString()} total
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
