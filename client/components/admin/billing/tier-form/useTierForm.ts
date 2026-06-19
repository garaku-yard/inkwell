import { useEffect, useState } from "react"

import type { CreateTierInput } from "@/lib/storage"
import type { SubscriptionTier } from "@/types/billing"

/** Editable form state for a subscription tier. Prices are dollar strings for
 *  the inputs; numeric caps are strings paired with an "unlimited" flag. */
export interface TierFormState {
  name: string
  slug: string
  description: string
  monthlyPrice: string
  yearlyPrice: string
  isActive: boolean
  isPublic: boolean
  perSeat: boolean
  maxProjects: string
  maxProjectsUnlimited: boolean
  maxCollaborators: string
  maxCollaboratorsUnlimited: boolean
  businessWorkspaces: boolean
  featureBullets: string[]
}

function blank(): TierFormState {
  return {
    name: "",
    slug: "",
    description: "",
    monthlyPrice: "0",
    yearlyPrice: "0",
    isActive: true,
    isPublic: true,
    perSeat: false,
    maxProjects: "3",
    maxProjectsUnlimited: false,
    maxCollaborators: "1",
    maxCollaboratorsUnlimited: false,
    businessWorkspaces: false,
    featureBullets: [],
  }
}

function fromTier(t: SubscriptionTier): TierFormState {
  const cap = (v: number, fallback: string) => (v < 0 ? fallback : String(v))
  return {
    name: t.name,
    slug: t.slug,
    description: t.description,
    monthlyPrice: (t.monthlyPriceCents / 100).toString(),
    yearlyPrice: (t.yearlyPriceCents / 100).toString(),
    isActive: t.isActive,
    isPublic: t.isPublic,
    perSeat: t.perSeat,
    maxProjects: cap(t.limits.maxProjects, "3"),
    maxProjectsUnlimited: t.limits.maxProjects < 0,
    maxCollaborators: cap(t.limits.maxCollaboratorsPerProject, "1"),
    maxCollaboratorsUnlimited: t.limits.maxCollaboratorsPerProject < 0,
    businessWorkspaces: t.limits.businessWorkspaces,
    featureBullets: t.featureBullets ?? [],
  }
}

/**
 * Tier-editor form state. Resets from `tier` (null = create). Exposes a single
 * `update(patch)` setter so the presentational sub-fields stay dumb, plus
 * `buildInput()` which produces the wire shape (dollars→cents, unlimited→-1).
 */
export function useTierForm(tier: SubscriptionTier | null) {
  const [form, setForm] = useState<TierFormState>(blank())

  useEffect(() => {
    setForm(tier ? fromTier(tier) : blank())
  }, [tier])

  const update = (patch: Partial<TierFormState>) =>
    setForm((f) => ({ ...f, ...patch }))

  const buildInput = (): CreateTierInput => {
    const toCents = (s: string) => Math.max(0, Math.round((parseFloat(s) || 0) * 100))
    const toCap = (s: string, unlimited: boolean) =>
      unlimited ? -1 : Math.max(0, parseInt(s, 10) || 0)
    return {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description,
      monthlyPriceCents: toCents(form.monthlyPrice),
      yearlyPriceCents: toCents(form.yearlyPrice),
      displayOrder: tier?.displayOrder ?? 0,
      isActive: form.isActive,
      isPublic: form.isPublic,
      isDefault: tier?.isDefault ?? false, // not editable here; preserved
      perSeat: form.perSeat,
      limits: {
        maxProjects: toCap(form.maxProjects, form.maxProjectsUnlimited),
        maxCollaboratorsPerProject: toCap(form.maxCollaborators, form.maxCollaboratorsUnlimited),
        businessWorkspaces: form.businessWorkspaces,
      },
      featureBullets: form.featureBullets.map((b) => b.trim()).filter(Boolean),
    }
  }

  return { form, update, buildInput }
}
