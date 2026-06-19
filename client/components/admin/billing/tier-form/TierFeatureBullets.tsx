"use client"

import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { TierFormState } from "./useTierForm"

interface Props {
  form: TierFormState
  update: (patch: Partial<TierFormState>) => void
}

/** Editor for the marketing bullet list shown on the pricing page. */
export function TierFeatureBullets({ form, update }: Props) {
  const bullets = form.featureBullets

  const setAt = (i: number, v: string) =>
    update({ featureBullets: bullets.map((b, idx) => (idx === i ? v : b)) })
  const removeAt = (i: number) =>
    update({ featureBullets: bullets.filter((_, idx) => idx !== i) })
  const add = () => update({ featureBullets: [...bullets, ""] })

  return (
    <div className="space-y-2">
      <Label>Pricing-page bullets</Label>
      <p className="text-xs text-muted-foreground">
        Display only — what this tier advertises (e.g. “Unlimited projects”).
      </p>
      <div className="space-y-2">
        {bullets.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={b}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder="Unlimited projects"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeAt(i)}
              aria-label="Remove bullet"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {bullets.length === 0 && (
          <p className="text-sm text-muted-foreground">No bullets yet.</p>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="mr-2 h-4 w-4" />
        Add bullet
      </Button>
    </div>
  )
}
