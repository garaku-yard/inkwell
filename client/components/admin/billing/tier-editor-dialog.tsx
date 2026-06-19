"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { createTier, updateTier } from "@/services/admin-billing"
import type { SubscriptionTier } from "@/types/billing"

import { useTierForm } from "./tier-form/useTierForm"
import { TierDetailsFields } from "./tier-form/TierDetailsFields"
import { TierLimitsFields } from "./tier-form/TierLimitsFields"
import { TierFeatureBullets } from "./tier-form/TierFeatureBullets"

interface TierEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tier: SubscriptionTier | null
  onSave: () => void
}

/**
 * Create/edit a subscription tier. Composition over a `useTierForm` hook +
 * three presentational field groups (details / limits & gates / bullets) — the
 * editor only exposes what the billing model persists and the paywall enforces.
 */
export function TierEditorDialog({ open, onOpenChange, tier, onSave }: TierEditorDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const { form, update, buildInput } = useTierForm(tier)

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Tier name is required", variant: "destructive" })
      return
    }
    setIsLoading(true)
    try {
      const input = buildInput()
      if (tier) {
        await updateTier(tier.id, input)
        toast({ title: "Tier updated" })
      } else {
        await createTier(input)
        toast({ title: "Tier created" })
      }
      onSave()
      onOpenChange(false)
    } catch {
      toast({
        title: tier ? "Failed to update tier" : "Failed to create tier",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tier ? "Edit tier" : "Create tier"}</DialogTitle>
          <DialogDescription>
            Pricing, the enforced caps, and the pricing-page copy.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="limits">Limits &amp; gates</TabsTrigger>
            <TabsTrigger value="bullets">Bullets</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-4">
            <TierDetailsFields form={form} update={update} />
          </TabsContent>
          <TabsContent value="limits" className="mt-4">
            <TierLimitsFields form={form} update={update} />
          </TabsContent>
          <TabsContent value="bullets" className="mt-4">
            <TierFeatureBullets form={form} update={update} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tier ? "Update tier" : "Create tier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
