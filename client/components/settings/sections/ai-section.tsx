"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Check,
  Key,
  Loader2,
  Plug,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getStorage } from "@/lib/storage"
import type {
  AIProviderSettings,
  SaveProviderSettingsInput,
} from "@/lib/storage"
import type { ProviderKind } from "@/lib/ai/providers"

interface KindMeta {
  kind: ProviderKind
  label: string
  description: string
  needsKey: boolean
  showsBaseUrl: boolean
  modelPlaceholder: string
  defaultLabel: string
}

const KIND_META: KindMeta[] = [
  {
    kind: "openai",
    label: "OpenAI",
    description: "GPT-4o, GPT-4o-mini, o1, and other OpenAI-hosted models.",
    needsKey: true,
    showsBaseUrl: false,
    modelPlaceholder: "gpt-4o-mini",
    defaultLabel: "OpenAI",
  },
  {
    kind: "anthropic",
    label: "Anthropic",
    description: "Claude Opus, Sonnet, and Haiku via the Messages API.",
    needsKey: true,
    showsBaseUrl: false,
    modelPlaceholder: "claude-3-5-sonnet-20241022",
    defaultLabel: "Anthropic",
  },
  {
    kind: "gemini",
    label: "Google Gemini",
    description: "Gemini 1.5 Pro, Flash, and newer via AI Studio.",
    needsKey: true,
    showsBaseUrl: false,
    modelPlaceholder: "gemini-1.5-pro",
    defaultLabel: "Gemini",
  },
  {
    kind: "openai_compatible",
    label: "OpenAI-compatible / Local",
    description:
      "Ollama, LM Studio, llama.cpp, OpenRouter, or any endpoint speaking OpenAI's /chat/completions contract.",
    needsKey: false,
    showsBaseUrl: true,
    modelPlaceholder: "llama3.2:3b",
    defaultLabel: "Local (Ollama)",
  },
]

function metaFor(kind: ProviderKind): KindMeta {
  return KIND_META.find((m) => m.kind === kind) ?? KIND_META[0]
}

function availableKinds(hostedAllowed: boolean): KindMeta[] {
  return hostedAllowed
    ? KIND_META
    : KIND_META.filter((m) => m.kind === "openai_compatible")
}

interface FormState {
  id?: string
  kind: ProviderKind
  label: string
  enabled: boolean
  baseUrl: string
  defaultModel: string
  apiKey: string
  replaceKey: boolean
}

function emptyForm(hostedAllowed: boolean): FormState {
  const kind: ProviderKind = hostedAllowed ? "openai" : "openai_compatible"
  return {
    kind,
    label: metaFor(kind).defaultLabel,
    enabled: true,
    baseUrl: "",
    defaultModel: "",
    apiKey: "",
    replaceKey: true,
  }
}

function formFromSettings(settings: AIProviderSettings): FormState {
  return {
    id: settings.id,
    kind: settings.kind,
    label: settings.label,
    enabled: settings.enabled,
    baseUrl: settings.baseUrl ?? "",
    defaultModel: settings.defaultModel ?? "",
    apiKey: "",
    replaceKey: !settings.hasKey,
  }
}

/** Settings section for BYO AI providers.
 *
 *  Reads provider rows + keychain state through {@link Storage.ai}. Gates
 *  the whole section behind the `ai.byo` capability: the hosted web build
 *  renders a placeholder pointing at the desktop app until the server-side
 *  encrypted-key path ships (plan phase 4). */
export function AISection() {
  const storage = getStorage()
  const supported = storage.capabilities.has("ai.byo")
  const hostedAllowed = storage.capabilities.has("ai.byo.hosted")

  const [providers, setProviders] = useState<AIProviderSettings[]>([])
  const [loading, setLoading] = useState(supported)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<FormState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AIProviderSettings | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; error?: string }>
  >({})

  const reload = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    setError(null)
    try {
      const rows = await storage.ai.listProviderSettings()
      setProviders(rows)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [storage, supported])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!supported) {
    return <UnsupportedPlaceholder />
  }

  return (
    <div className="space-y-6">
      <IntroCard hostedAllowed={hostedAllowed} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Configured providers</CardTitle>
              <CardDescription>
                Enable, disable, or remove any provider. Keys live in your OS
                keychain — they never touch disk or the network until a chat
                request is sent.
              </CardDescription>
            </div>
            <Button onClick={() => setEditing(emptyForm(hostedAllowed))}>
              <Plus className="mr-2 h-4 w-4" />
              Add provider
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading providers…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : providers.length === 0 ? (
            <EmptyState onAdd={() => setEditing(emptyForm(hostedAllowed))} />
          ) : (
            <ul className="divide-y divide-border">
              {providers.map((p) => (
                <ProviderRow
                  key={p.id}
                  provider={p}
                  testResult={testResults[p.id]}
                  testing={testingId === p.id}
                  onEdit={() => setEditing(formFromSettings(p))}
                  onDelete={() => setDeleteTarget(p)}
                  onTest={async () => {
                    setTestingId(p.id)
                    const result = await storage.ai.testProvider(p.id)
                    setTestResults((prev) => ({
                      ...prev,
                      [p.id]: result.ok ? { ok: true } : { ok: false, error: result.error },
                    }))
                    setTestingId(null)
                  }}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editing && (
        <ProviderFormDialog
          state={editing}
          hostedAllowed={hostedAllowed}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await reload()
          }}
        />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleteTarget?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the provider row and clears its key from your OS
              keychain. Your chat history isn't affected. You can re-add it at
              any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return
                const id = deleteTarget.id
                setDeleteTarget(null)
                await storage.ai.deleteProviderSettings(id)
                await reload()
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function IntroCard({ hostedAllowed }: { hostedAllowed: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-100 p-2 dark:bg-amber-900/30">
            <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-2">
            <CardTitle>AI providers</CardTitle>
            {hostedAllowed ? (
              <CardDescription>
                Bring your own keys for OpenAI, Anthropic, Gemini, or any
                OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter,
                custom deployments). Keys stay in your OS keychain. Chat
                requests go directly from Inkwell to the provider — nothing
                routes through our servers.
              </CardDescription>
            ) : (
              <>
                <CardDescription>
                  On the web build you can wire up any OpenAI-compatible
                  endpoint — local models on your own machine (Ollama, LM
                  Studio, llama.cpp) or remote aggregators like OpenRouter.
                  The chat request goes directly from your browser to the
                  endpoint, never through our servers.
                </CardDescription>
                <CardDescription className="text-xs">
                  BYO for OpenAI / Anthropic / Gemini on the web needs a
                  server-side encrypted key store and is coming in a future
                  update. For those today, use the{" "}
                  <a
                    className="underline underline-offset-2"
                    href="https://github.com/l1roii/inkwell/releases"
                    target="_blank"
                    rel="noreferrer"
                  >
                    desktop app
                  </a>{" "}
                  (keys live in your OS keychain). Configuration + optional
                  keys for local/compatible endpoints are stored in your
                  browser — fine for keyless local models; treat OpenRouter-
                  style keys as browser-exposed.
                </CardDescription>
              </>
            )}
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

function UnsupportedPlaceholder() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-muted p-2">
            <Plug className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>AI providers — desktop only for now</CardTitle>
            <CardDescription className="mt-1">
              Bringing your own provider keys requires a secure on-device key
              store. On the desktop build (Windows, macOS, Linux) Inkwell
              uses the OS keychain; the hosted web build doesn't yet have
              the server-side encrypted store wired up. For now, configure
              your keys from the{" "}
              <a
                className="underline underline-offset-2"
                href="https://github.com/l1roii/inkwell/releases"
                target="_blank"
                rel="noreferrer"
              >
                desktop app
              </a>
              .
            </CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="rounded-full bg-muted p-3">
        <Plug className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="text-sm text-muted-foreground">
        No providers configured yet. Add one to enable the AI chat panel.
      </div>
      <Button variant="outline" onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Add your first provider
      </Button>
    </div>
  )
}

function ProviderRow({
  provider,
  testing,
  testResult,
  onEdit,
  onDelete,
  onTest,
}: {
  provider: AIProviderSettings
  testing: boolean
  testResult?: { ok: boolean; error?: string }
  onEdit: () => void
  onDelete: () => void
  onTest: () => void
}) {
  const meta = metaFor(provider.kind)
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{provider.label}</span>
          <Badge variant="outline" className="text-xs">
            {meta.label}
          </Badge>
          {!provider.enabled && (
            <Badge variant="secondary" className="text-xs">
              Disabled
            </Badge>
          )}
          {provider.hasKey ? (
            <Badge variant="outline" className="gap-1 text-xs">
              <Key className="h-3 w-3" /> Key saved
            </Badge>
          ) : meta.needsKey ? (
            <Badge variant="destructive" className="text-xs">
              Key missing
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {provider.defaultModel || "No default model"}
          {provider.baseUrl ? ` · ${provider.baseUrl}` : ""}
        </div>
        {testResult && (
          <div
            className={`mt-2 flex items-center gap-1 text-xs ${
              testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
            }`}
          >
            {testResult.ok ? (
              <>
                <Check className="h-3 w-3" /> Connection OK
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3" />
                <span className="break-all">
                  {renderTestError(testResult.error ?? "", provider)}
                </span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onTest} disabled={testing}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Remove provider">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  )
}

function renderTestError(raw: string, provider: AIProviderSettings): string {
  const msg = raw.toLowerCase()
  if (
    provider.kind === "openai_compatible" &&
    (msg.includes("cors") || msg.includes("failed to fetch") || msg.includes("networkerror"))
  ) {
    return `Couldn't reach ${provider.baseUrl || "the server"}. If this is Ollama, start it with OLLAMA_ORIGINS=${typeof window !== "undefined" ? window.location.origin : "<your origin>"} so your browser can reach it.`
  }
  return raw
}

function ProviderFormDialog({
  state,
  hostedAllowed,
  onChange,
  onClose,
  onSaved,
}: {
  state: FormState
  hostedAllowed: boolean
  onChange: (s: FormState) => void
  onClose: () => void
  onSaved: () => void
}) {
  const storage = getStorage()
  const meta = metaFor(state.kind)
  const kindOptions = availableKinds(hostedAllowed)
  const isCreate = !state.id
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cannotSave = useMemo(() => {
    if (!state.label.trim()) return true
    if (meta.showsBaseUrl && !state.baseUrl.trim()) return true
    if (meta.needsKey && state.replaceKey && !state.apiKey) return true
    return false
  }, [state, meta])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const input: SaveProviderSettingsInput = {
        id: state.id,
        kind: state.kind,
        label: state.label.trim(),
        enabled: state.enabled,
        baseUrl: state.baseUrl.trim() || undefined,
        defaultModel: state.defaultModel.trim() || undefined,
      }
      const saved = await storage.ai.saveProviderSettings(input)
      if (state.replaceKey && state.apiKey) {
        await storage.ai.setApiKey(saved.id, state.apiKey)
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isCreate ? "Add AI provider" : "Edit provider"}</DialogTitle>
            <DialogDescription>
              Configuration stays on this device. Keys go straight to your OS
              keychain.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ai-kind">Provider</Label>
              <Select
                value={state.kind}
                onValueChange={(v) => {
                  const next = v as ProviderKind
                  const nextMeta = metaFor(next)
                  const previousDefault = metaFor(state.kind).defaultLabel
                  const labelIsUntouched =
                    !state.label.trim() || state.label === previousDefault
                  onChange({
                    ...state,
                    kind: next,
                    label: labelIsUntouched ? nextMeta.defaultLabel : state.label,
                  })
                }}
                disabled={!isCreate}
              >
                <SelectTrigger id="ai-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kindOptions.map((m) => (
                    <SelectItem key={m.kind} value={m.kind}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-label">Label</Label>
              <Input
                id="ai-label"
                value={state.label}
                onChange={(e) => onChange({ ...state, label: e.target.value })}
                placeholder={meta.defaultLabel}
                required
              />
            </div>

            {meta.showsBaseUrl && (
              <div className="space-y-2">
                <Label htmlFor="ai-baseurl">Base URL</Label>
                <Input
                  id="ai-baseurl"
                  type="url"
                  value={state.baseUrl}
                  onChange={(e) => onChange({ ...state, baseUrl: e.target.value })}
                  placeholder="http://localhost:11434/v1"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Ollama: <code>http://localhost:11434/v1</code>. LM Studio:{" "}
                  <code>http://localhost:1234/v1</code>. OpenRouter:{" "}
                  <code>https://openrouter.ai/api/v1</code>.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ai-model">Default model</Label>
              <Input
                id="ai-model"
                value={state.defaultModel}
                onChange={(e) => onChange({ ...state, defaultModel: e.target.value })}
                placeholder={meta.modelPlaceholder}
              />
              <p className="text-xs text-muted-foreground">
                Pre-fills the chat panel; you can still override per
                conversation.
              </p>
            </div>

            {(meta.needsKey || state.kind === "openai_compatible") && (
              <ApiKeyField
                kind={state.kind}
                state={state}
                onChange={onChange}
                existingKey={!isCreate && !state.replaceKey}
              />
            )}

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="ai-enabled" className="text-sm font-medium">
                  Enabled
                </Label>
                <p className="text-xs text-muted-foreground">
                  Disabled providers don't appear in the chat panel picker.
                </p>
              </div>
              <Switch
                id="ai-enabled"
                checked={state.enabled}
                onCheckedChange={(v) => onChange({ ...state, enabled: v })}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={saving || cannotSave}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isCreate ? "Add provider" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ApiKeyField({
  kind,
  state,
  onChange,
  existingKey,
}: {
  kind: ProviderKind
  state: FormState
  onChange: (s: FormState) => void
  existingKey: boolean
}) {
  const meta = metaFor(kind)
  const optional = !meta.needsKey
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="ai-key">
          API key{optional ? " (optional)" : ""}
        </Label>
        {existingKey && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...state, replaceKey: true })}
          >
            Replace
          </Button>
        )}
      </div>
      {state.replaceKey ? (
        <Input
          id="ai-key"
          type="password"
          autoComplete="off"
          value={state.apiKey}
          onChange={(e) => onChange({ ...state, apiKey: e.target.value })}
          placeholder={
            kind === "openai"
              ? "sk-…"
              : kind === "anthropic"
                ? "sk-ant-…"
                : kind === "gemini"
                  ? "AIza…"
                  : "optional"
          }
          required={meta.needsKey}
        />
      ) : (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <Key className="h-4 w-4" />
          Key saved — click Replace to change it.
        </div>
      )}
    </div>
  )
}
