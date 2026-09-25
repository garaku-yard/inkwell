"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type CloudHostMode = "official" | "custom"

interface CloudHostPickerProps {
  mode: CloudHostMode
  customUrl: string
  disabled?: boolean
  onModeChange: (mode: CloudHostMode) => void
  onCustomUrlChange: (url: string) => void
}

/** Chooses the service a desktop account is linked to. */
export function CloudHostPicker({
  mode,
  customUrl,
  disabled = false,
  onModeChange,
  onCustomUrlChange,
}: CloudHostPickerProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="cloud-host">Cloud host</Label>
      <Select
        value={mode}
        onValueChange={(value) => onModeChange(value as CloudHostMode)}
        disabled={disabled}
      >
        <SelectTrigger id="cloud-host" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="official">Inkwell Cloud</SelectItem>
          <SelectItem value="custom">Custom or self-hosted</SelectItem>
        </SelectContent>
      </Select>

      {mode === "custom" && (
        <Input
          aria-label="Custom host URL"
          type="url"
          value={customUrl}
          onChange={(event) => onCustomUrlChange(event.target.value)}
          placeholder="https://inkwell.example.com"
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          required
        />
      )}

      <p className="text-xs text-muted-foreground">
        {mode === "official"
          ? "Connect to inkwell.garakuyard.com for Inkwell plans and cloud sync."
          : "Connect to another Inkwell host. Available plans and features are set by that host."}
      </p>
    </div>
  )
}
