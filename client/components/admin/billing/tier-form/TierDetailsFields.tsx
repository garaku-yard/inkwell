"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"

import type { TierFormState } from "./useTierForm"

interface Props {
  form: TierFormState
  update: (patch: Partial<TierFormState>) => void
}

/** Name / slug / description / pricing / visibility. */
export function TierDetailsFields({ form, update }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tier-name">Tier Name *</Label>
          <Input
            id="tier-name"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Pro"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tier-slug">Slug</Label>
          <Input
            id="tier-slug"
            value={form.slug}
            onChange={(e) => update({ slug: e.target.value })}
            placeholder="auto from name if blank"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tier-description">Description</Label>
        <Textarea
          id="tier-description"
          value={form.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="For professional writers who collaborate…"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tier-monthly">Monthly Price (USD)</Label>
          <Input
            id="tier-monthly"
            type="number"
            min="0"
            step="0.01"
            value={form.monthlyPrice}
            onChange={(e) => update({ monthlyPrice: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tier-yearly">Yearly Price (USD)</Label>
          <Input
            id="tier-yearly"
            type="number"
            min="0"
            step="0.01"
            value={form.yearlyPrice}
            onChange={(e) => update({ yearlyPrice: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <Label htmlFor="tier-active">Active</Label>
          <p className="text-xs text-muted-foreground">Users can subscribe to this tier.</p>
        </div>
        <Switch
          id="tier-active"
          checked={form.isActive}
          onCheckedChange={(v) => update({ isActive: v })}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <Label htmlFor="tier-public">Show on pricing page</Label>
          <p className="text-xs text-muted-foreground">Visible to the public, not just admins.</p>
        </div>
        <Switch
          id="tier-public"
          checked={form.isPublic}
          onCheckedChange={(v) => update({ isPublic: v })}
        />
      </div>
    </div>
  )
}
