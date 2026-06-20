"use client"

import { useState, useEffect } from "react"
import { CheckCircle2, XCircle, Key, Webhook } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { getGateways, getGatewayConfig, updateGatewayConfig, setActiveGateway, toggleGatewayTestMode } from "@/services/admin-billing"
import type { PaymentGateway, GatewayConfig } from "@/types/billing"

export function GatewayConfiguration() {
  const [gateways, setGateways] = useState<PaymentGateway[]>([])
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null)
  const [config, setConfig] = useState<GatewayConfig | null>(null)
  const [, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  // Form fields
  const [publicKey, setPublicKey] = useState("")
  const [secretKey, setSecretKey] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [webhooksEnabled, setWebhooksEnabled] = useState(true)

  useEffect(() => {
    loadGateways()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedGateway) {
      loadGatewayConfig(selectedGateway.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGateway])

  const loadGateways = async () => {
    try {
      setIsLoading(true)
      const data = await getGateways()
      setGateways(data)
      const active = data.find(g => g.active)
      if (active) setSelectedGateway(active)
    } catch (error) {
      toast({ title: "Failed to load gateways", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const loadGatewayConfig = async (gatewayId: string) => {
    try {
      const data = await getGatewayConfig(gatewayId)
      setConfig(data)
      setPublicKey(data.credentials.publicKey || "")
      setSecretKey(data.credentials.secretKey || "")
      setWebhookSecret(data.credentials.webhookSecret || "")
      setWebhooksEnabled(data.webhooksEnabled)
    } catch (error) {
      toast({ title: "Failed to load gateway config", variant: "destructive" })
    }
  }

  const handleSaveConfig = async () => {
    if (!selectedGateway || !config) return

    setIsSaving(true)
    try {
      const updatedConfig: GatewayConfig = {
        ...config,
        credentials: {
          ...config.credentials,
          publicKey,
          secretKey,
          webhookSecret
        },
        webhooksEnabled
      }
      await updateGatewayConfig(selectedGateway.id, updatedConfig)
      toast({ title: "Configuration saved", description: "Gateway settings have been updated" })
    } catch (error) {
      toast({ title: "Failed to save config", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleActivateGateway = async (gatewayId: string) => {
    try {
      await setActiveGateway(gatewayId)
      toast({ title: "Gateway activated", description: "This gateway is now active" })
      loadGateways()
    } catch (error) {
      toast({ title: "Failed to activate gateway", variant: "destructive" })
    }
  }

  const handleToggleTestMode = async (gatewayId: string, testMode: boolean) => {
    try {
      await toggleGatewayTestMode(gatewayId, testMode)
      toast({ 
        title: testMode ? "Test mode enabled" : "Live mode enabled",
        description: testMode ? "Using test credentials" : "Using live credentials"
      })
      loadGateways()
    } catch (error) {
      toast({ title: "Failed to toggle test mode", variant: "destructive" })
    }
  }

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case "stripe": return "💳"
      case "paddle": return "🏓"
      case "lemonsqueezy": return "🍋"
      case "paypal": return "💰"
      default: return "💼"
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment Gateway Configuration</CardTitle>
          <CardDescription>
            Connect and configure payment providers. Only one gateway can be active at a time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {gateways.map((gateway) => (
              <div
                key={gateway.id}
                className={`relative p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  selectedGateway?.id === gateway.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                }`}
                onClick={() => setSelectedGateway(gateway)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getProviderIcon(gateway.provider)}</span>
                    <div>
                      <h4 className="font-medium">{gateway.name}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                        {gateway.provider}
                      </p>
                    </div>
                  </div>
                  {gateway.active ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Inactive
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={gateway.testMode ? "secondary" : "default"} className="text-xs">
                    {gateway.testMode ? "Test Mode" : "Live Mode"}
                  </Badge>
                </div>
                {!gateway.active && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleActivateGateway(gateway.id)
                    }}
                  >
                    Activate
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedGateway && config && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
                  <Key className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle>API Credentials</CardTitle>
                  <CardDescription>
                    Configure {selectedGateway.name} API keys
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="publicKey">Publishable Key / Public Key</Label>
                <Input
                  id="publicKey"
                  type="text"
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder={selectedGateway.testMode ? "pk_test_..." : "pk_live_..."}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secretKey">Secret Key</Label>
                <Input
                  id="secretKey"
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder={selectedGateway.testMode ? "sk_test_..." : "sk_live_..."}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhookSecret">Webhook Secret</Label>
                <Input
                  id="webhookSecret"
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="whsec_..."
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Used to verify webhook signatures from {selectedGateway.name}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
                <div>
                  <Label htmlFor="testMode">Test Mode</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Use test credentials and sandbox environment
                  </p>
                </div>
                <Switch
                  id="testMode"
                  checked={selectedGateway.testMode}
                  onCheckedChange={(checked) => handleToggleTestMode(selectedGateway.id, checked)}
                />
              </div>

              <Button onClick={handleSaveConfig} disabled={isSaving} className="w-full">
                {isSaving ? "Saving..." : "Save Configuration"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
                  <Webhook className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle>Webhooks</CardTitle>
                  <CardDescription>
                    Configure webhook endpoints for payment events
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="webhooksEnabled">Enable Webhooks</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Receive real-time updates about subscription events
                  </p>
                </div>
                <Switch
                  id="webhooksEnabled"
                  checked={webhooksEnabled}
                  onCheckedChange={setWebhooksEnabled}
                />
              </div>

              {webhooksEnabled && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900 p-4">
                  <h4 className="font-medium text-sm mb-2">Webhook URL</h4>
                  <code className="text-xs bg-white dark:bg-gray-900 px-3 py-2 rounded block">
                    https://yourdomain.com/api/webhooks/{selectedGateway.provider}
                  </code>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    Add this URL to your {selectedGateway.name} dashboard webhook settings
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
