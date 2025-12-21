"use client"

import { useState, useEffect } from "react"
import { Loader2, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { createTier, updateTier } from "@/services/admin-billing"
import type { SubscriptionTier } from "@/types/billing"

interface TierEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tier: SubscriptionTier | null
  onSave: () => void
}

const AVAILABLE_THEMES = [
  "default", "ocean", "forest", "sunset", "midnight", "rose"
]

const EXPORT_FORMATS = [
  "pdf", "fountain", "fdx", "docx", "txt"
]

export function TierEditorDialog({ open, onOpenChange, tier, onSave }: TierEditorDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  
  // Form state
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [monthlyPrice, setMonthlyPrice] = useState("0")
  const [yearlyPrice, setYearlyPrice] = useState("0")
  const [currency, setCurrency] = useState("USD")
  const [status, setStatus] = useState<"active" | "inactive" | "archived">("active")
  
  // Limits
  const [aiTokens, setAiTokens] = useState("10000")
  const [aiTokensUnlimited, setAiTokensUnlimited] = useState(false)
  const [maxProjects, setMaxProjects] = useState("3")
  const [maxProjectsUnlimited, setMaxProjectsUnlimited] = useState(false)
  const [maxCollaborators, setMaxCollaborators] = useState("1")
  const [maxCollaboratorsUnlimited, setMaxCollaboratorsUnlimited] = useState(false)
  const [storageGB, setStorageGB] = useState("5")
  const [storageUnlimited, setStorageUnlimited] = useState(false)
  
  // Features
  const [selectedThemes, setSelectedThemes] = useState<string[]>(["default"])
  const [aiFeatures, setAiFeatures] = useState(false)
  const [collaborationEnabled, setCollaborationEnabled] = useState(false)
  const [selectedExportFormats, setSelectedExportFormats] = useState<string[]>(["pdf", "fountain"])
  const [prioritySupport, setPrioritySupport] = useState(false)
  const [customBranding, setCustomBranding] = useState(false)
  
  // Rules
  const [limitType, setLimitType] = useState<"soft" | "hard">("hard")
  const [overageHandling, setOverageHandling] = useState<"block" | "throttle" | "charge">("block")
  const [trialDays, setTrialDays] = useState("")
  const [gracePeriodDays, setGracePeriodDays] = useState("3")

  useEffect(() => {
    if (tier) {
      setName(tier.name)
      setSlug(tier.slug)
      setDescription(tier.description)
      setMonthlyPrice(tier.price.monthly.toString())
      setYearlyPrice(tier.price.yearly.toString())
      setCurrency(tier.price.currency)
      setStatus(tier.status)
      
      setAiTokensUnlimited(tier.limits.aiTokens === "unlimited")
      setAiTokens(tier.limits.aiTokens === "unlimited" ? "10000" : tier.limits.aiTokens.toString())
      setMaxProjectsUnlimited(tier.limits.maxProjects === "unlimited")
      setMaxProjects(tier.limits.maxProjects === "unlimited" ? "3" : tier.limits.maxProjects.toString())
      setMaxCollaboratorsUnlimited(tier.limits.maxCollaborators === "unlimited")
      setMaxCollaborators(tier.limits.maxCollaborators === "unlimited" ? "1" : tier.limits.maxCollaborators.toString())
      setStorageUnlimited(tier.limits.storageGB === "unlimited")
      setStorageGB(tier.limits.storageGB === "unlimited" ? "5" : tier.limits.storageGB.toString())
      
      setSelectedThemes(tier.features.availableThemes)
      setAiFeatures(tier.features.aiFeatures)
      setCollaborationEnabled(tier.features.collaborationEnabled)
      setSelectedExportFormats(tier.features.exportFormats)
      setPrioritySupport(tier.features.prioritySupport)
      setCustomBranding(tier.features.customBranding)
      
      setLimitType(tier.rules.limitType)
      setOverageHandling(tier.rules.overageHandling)
      setTrialDays(tier.rules.trialDays?.toString() || "")
      setGracePeriodDays(tier.rules.gracePeriodDays?.toString() || "3")
    } else {
      // Reset form for new tier
      setName("")
      setSlug("")
      setDescription("")
      setMonthlyPrice("0")
      setYearlyPrice("0")
      setSelectedThemes(["default"])
      setAiFeatures(false)
      setCollaborationEnabled(false)
      setSelectedExportFormats(["pdf", "fountain"])
    }
  }, [tier])

  const handleSubmit = async () => {
    if (!name || !slug) {
      toast({ title: "Missing required fields", variant: "destructive" })
      return
    }

    setIsLoading(true)
    try {
      const tierData: Omit<SubscriptionTier, "id" | "createdAt" | "updatedAt"> = {
        name,
        slug,
        description,
        price: {
          monthly: parseFloat(monthlyPrice),
          yearly: parseFloat(yearlyPrice),
          currency
        },
        status,
        displayOrder: tier?.displayOrder || 0,
        limits: {
          aiTokens: aiTokensUnlimited ? "unlimited" : parseInt(aiTokens),
          maxProjects: maxProjectsUnlimited ? "unlimited" : parseInt(maxProjects),
          maxCollaborators: maxCollaboratorsUnlimited ? "unlimited" : parseInt(maxCollaborators),
          storageGB: storageUnlimited ? "unlimited" : parseInt(storageGB)
        },
        features: {
          availableThemes: selectedThemes,
          aiFeatures,
          collaborationEnabled,
          exportFormats: selectedExportFormats,
          prioritySupport,
          customBranding
        },
        rules: {
          limitType,
          overageHandling,
          trialDays: trialDays ? parseInt(trialDays) : undefined,
          gracePeriodDays: parseInt(gracePeriodDays)
        },
        gatewayMappings: tier?.gatewayMappings || {}
      }

      if (tier) {
        await updateTier(tier.id, tierData)
        toast({ title: "Tier updated", description: "Subscription tier has been updated successfully" })
      } else {
        await createTier(tierData)
        toast({ title: "Tier created", description: "New subscription tier has been created" })
      }

      onSave()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: tier ? "Failed to update tier" : "Failed to create tier",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const toggleTheme = (theme: string) => {
    setSelectedThemes(prev =>
      prev.includes(theme) ? prev.filter(t => t !== theme) : [...prev, theme]
    )
  }

  const toggleExportFormat = (format: string) => {
    setSelectedExportFormats(prev =>
      prev.includes(format) ? prev.filter(f => f !== format) : [...prev, format]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tier ? "Edit Tier" : "Create New Tier"}</DialogTitle>
          <DialogDescription>
            Configure subscription tier settings, limits, and features
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="limits">Limits</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tier Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Pro"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="pro"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="For professional screenwriters..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthlyPrice">Monthly Price</Label>
                <Input
                  id="monthlyPrice"
                  type="number"
                  value={monthlyPrice}
                  onChange={(e) => setMonthlyPrice(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yearlyPrice">Yearly Price</Label>
                <Input
                  id="yearlyPrice"
                  type="number"
                  value={yearlyPrice}
                  onChange={(e) => setYearlyPrice(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="limits" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="aiTokens">AI Tokens per Month</Label>
                  <Input
                    id="aiTokens"
                    type="number"
                    value={aiTokens}
                    onChange={(e) => setAiTokens(e.target.value)}
                    disabled={aiTokensUnlimited}
                    min="0"
                  />
                </div>
                <div className="flex items-center space-x-2 pb-2">
                  <Switch
                    id="aiTokensUnlimited"
                    checked={aiTokensUnlimited}
                    onCheckedChange={setAiTokensUnlimited}
                  />
                  <Label htmlFor="aiTokensUnlimited">Unlimited</Label>
                </div>
              </div>

              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="maxProjects">Maximum Projects</Label>
                  <Input
                    id="maxProjects"
                    type="number"
                    value={maxProjects}
                    onChange={(e) => setMaxProjects(e.target.value)}
                    disabled={maxProjectsUnlimited}
                    min="0"
                  />
                </div>
                <div className="flex items-center space-x-2 pb-2">
                  <Switch
                    id="maxProjectsUnlimited"
                    checked={maxProjectsUnlimited}
                    onCheckedChange={setMaxProjectsUnlimited}
                  />
                  <Label htmlFor="maxProjectsUnlimited">Unlimited</Label>
                </div>
              </div>

              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="maxCollaborators">Max Collaborators per Project</Label>
                  <Input
                    id="maxCollaborators"
                    type="number"
                    value={maxCollaborators}
                    onChange={(e) => setMaxCollaborators(e.target.value)}
                    disabled={maxCollaboratorsUnlimited}
                    min="0"
                  />
                </div>
                <div className="flex items-center space-x-2 pb-2">
                  <Switch
                    id="maxCollaboratorsUnlimited"
                    checked={maxCollaboratorsUnlimited}
                    onCheckedChange={setMaxCollaboratorsUnlimited}
                  />
                  <Label htmlFor="maxCollaboratorsUnlimited">Unlimited</Label>
                </div>
              </div>

              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="storageGB">Storage (GB)</Label>
                  <Input
                    id="storageGB"
                    type="number"
                    value={storageGB}
                    onChange={(e) => setStorageGB(e.target.value)}
                    disabled={storageUnlimited}
                    min="0"
                  />
                </div>
                <div className="flex items-center space-x-2 pb-2">
                  <Switch
                    id="storageUnlimited"
                    checked={storageUnlimited}
                    onCheckedChange={setStorageUnlimited}
                  />
                  <Label htmlFor="storageUnlimited">Unlimited</Label>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="features" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Available Themes</Label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_THEMES.map(theme => (
                    <Badge
                      key={theme}
                      variant={selectedThemes.includes(theme) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleTheme(theme)}
                    >
                      {theme}
                      {selectedThemes.includes(theme) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Export Formats</Label>
                <div className="flex flex-wrap gap-2">
                  {EXPORT_FORMATS.map(format => (
                    <Badge
                      key={format}
                      variant={selectedExportFormats.includes(format) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleExportFormat(format)}
                    >
                      {format.toUpperCase()}
                      {selectedExportFormats.includes(format) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="aiFeatures">AI Features</Label>
                  <Switch
                    id="aiFeatures"
                    checked={aiFeatures}
                    onCheckedChange={setAiFeatures}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="collaborationEnabled">Collaboration Tools</Label>
                  <Switch
                    id="collaborationEnabled"
                    checked={collaborationEnabled}
                    onCheckedChange={setCollaborationEnabled}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="prioritySupport">Priority Support</Label>
                  <Switch
                    id="prioritySupport"
                    checked={prioritySupport}
                    onCheckedChange={setPrioritySupport}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="customBranding">Custom Branding</Label>
                  <Switch
                    id="customBranding"
                    checked={customBranding}
                    onCheckedChange={setCustomBranding}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="rules" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="limitType">Limit Type</Label>
                <Select value={limitType} onValueChange={(v: any) => setLimitType(v)}>
                  <SelectTrigger id="limitType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft">Soft (Warn user)</SelectItem>
                    <SelectItem value="hard">Hard (Block access)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="overageHandling">Overage Handling</Label>
                <Select value={overageHandling} onValueChange={(v: any) => setOverageHandling(v)}>
                  <SelectTrigger id="overageHandling">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Block</SelectItem>
                    <SelectItem value="throttle">Throttle</SelectItem>
                    <SelectItem value="charge">Charge Extra</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trialDays">Trial Period (days)</Label>
                  <Input
                    id="trialDays"
                    type="number"
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gracePeriodDays">Grace Period (days)</Label>
                  <Input
                    id="gracePeriodDays"
                    type="number"
                    value={gracePeriodDays}
                    onChange={(e) => setGracePeriodDays(e.target.value)}
                    min="0"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {tier ? "Update Tier" : "Create Tier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
