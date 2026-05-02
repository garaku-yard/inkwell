"use client"

import { useState, useEffect } from "react"
import { Plus, Edit, Trash2, GripVertical, AlertTriangle, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { getTiers, deleteTier } from "@/services/admin-billing"
import type { SubscriptionTier } from "@/types/billing"
import { TierEditorDialog } from "@/components/admin/billing/tier-editor-dialog"

export function TiersManagement() {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingTier, setEditingTier] = useState<SubscriptionTier | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadTiers()
  }, [])

  const loadTiers = async () => {
    try {
      setIsLoading(true)
      const data = await getTiers()
      setTiers(data.sort((a, b) => a.displayOrder - b.displayOrder))
    } catch (error) {
      toast({
        title: "Failed to load tiers",
        description: "Could not fetch subscription tiers",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (tier: SubscriptionTier) => {
    if (tier.subscriberCount && tier.subscriberCount > 0) {
      toast({
        title: "Cannot delete tier",
        description: `This tier has ${tier.subscriberCount} active subscribers`,
        variant: "destructive"
      })
      return
    }

    if (!confirm(`Are you sure you want to delete the "${tier.name}" tier?`)) {
      return
    }

    try {
      await deleteTier(tier.id)
      toast({ title: "Tier deleted", description: "Subscription tier has been removed" })
      loadTiers()
    } catch (error) {
      toast({
        title: "Failed to delete tier",
        variant: "destructive"
      })
    }
  }

  const handleSaveTier = async () => {
    setEditingTier(null)
    setIsCreating(false)
    loadTiers()
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          Loading tiers...
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Subscription Tiers</CardTitle>
              <CardDescription>
                Create and manage subscription plans with feature limits
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Tier
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tiers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No tiers created yet</p>
              <Button className="mt-4" onClick={() => setIsCreating(true)}>
                Create Your First Tier
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
                >
                  <button className="cursor-grab active:cursor-grabbing mt-1">
                    <GripVertical className="h-5 w-5 text-gray-400" />
                  </button>

                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{tier.name}</h3>
                          <Badge variant={tier.status === "active" ? "default" : "secondary"}>
                            {tier.status}
                          </Badge>
                          {tier.subscriberCount && tier.subscriberCount > 0 && (
                            <Badge variant="outline" className="gap-1">
                              <Users className="h-3 w-3" />
                              {tier.subscriberCount}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                          {tier.description}
                        </p>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Monthly:</span>{" "}
                            <span className="font-medium">
                              {tier.price.currency} {tier.price.monthly}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Yearly:</span>{" "}
                            <span className="font-medium">
                              {tier.price.currency} {tier.price.yearly}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Projects:</span>{" "}
                            <span className="font-medium">
                              {tier.limits.maxProjects === "unlimited" ? "∞" : tier.limits.maxProjects}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">AI Tokens:</span>{" "}
                            <span className="font-medium">
                              {tier.limits.aiTokens === "unlimited" ? "∞" : tier.limits.aiTokens.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingTier(tier)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(tier)}
                          disabled={!!(tier.subscriberCount && tier.subscriberCount > 0)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {tier.subscriberCount && tier.subscriberCount > 0 && (
                      <div className="mt-3 p-2 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Changes to this tier will affect {tier.subscriberCount} active subscribers</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TierEditorDialog
        open={isCreating || editingTier !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setIsCreating(false)
            setEditingTier(null)
          }
        }}
        tier={editingTier}
        onSave={handleSaveTier}
      />
    </div>
  )
}
