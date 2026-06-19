"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

import type { TierFormState } from "./useTierForm"

interface Props {
  form: TierFormState
  update: (patch: Partial<TierFormState>) => void
}

/** Enforced caps + the two gate toggles (business workspaces, per-seat). */
export function TierLimitsFields({ form, update }: Props) {
  return (
    <div className="space-y-4">
      <CapRow
        id="max-projects"
        label="Maximum synced projects"
        value={form.maxProjects}
        unlimited={form.maxProjectsUnlimited}
        onValue={(v) => update({ maxProjects: v })}
        onUnlimited={(v) => update({ maxProjectsUnlimited: v })}
      />
      <CapRow
        id="max-collaborators"
        label="Max collaborators per project"
        value={form.maxCollaborators}
        unlimited={form.maxCollaboratorsUnlimited}
        onValue={(v) => update({ maxCollaborators: v })}
        onUnlimited={(v) => update({ maxCollaboratorsUnlimited: v })}
      />

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <Label htmlFor="tier-business">Business workspaces</Label>
          <p className="text-xs text-muted-foreground">Unlocks org/business workspaces.</p>
        </div>
        <Switch
          id="tier-business"
          checked={form.businessWorkspaces}
          onCheckedChange={(v) => update({ businessWorkspaces: v })}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <Label htmlFor="tier-perseat">Per-seat billing</Label>
          <p className="text-xs text-muted-foreground">Billed per member (Business).</p>
        </div>
        <Switch
          id="tier-perseat"
          checked={form.perSeat}
          onCheckedChange={(v) => update({ perSeat: v })}
        />
      </div>
    </div>
  )
}

interface CapRowProps {
  id: string
  label: string
  value: string
  unlimited: boolean
  onValue: (v: string) => void
  onUnlimited: (v: boolean) => void
}

function CapRow({ id, label, value, unlimited, onValue, onUnlimited }: CapRowProps) {
  return (
    <div className="flex items-end gap-4">
      <div className="flex-1 space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="number"
          min="0"
          value={unlimited ? "" : value}
          onChange={(e) => onValue(e.target.value)}
          disabled={unlimited}
          placeholder={unlimited ? "Unlimited" : undefined}
        />
      </div>
      <div className="flex items-center gap-2 pb-2">
        <Switch id={`${id}-unlimited`} checked={unlimited} onCheckedChange={onUnlimited} />
        <Label htmlFor={`${id}-unlimited`}>Unlimited</Label>
      </div>
    </div>
  )
}
