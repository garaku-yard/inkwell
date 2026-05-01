"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { CategoryIcon, CATEGORY_COLORS } from "@/components/workspace/CategoryIcon"
import { cn } from "@/lib/utils"
import {
  disableCategory,
  enableCategory,
  listCategories,
  type Category,
  type Workspace,
} from "@/services/workspace"

interface CategoriesSectionProps {
  workspace: Workspace
  /** Called after a successful enable / disable so the parent can keep
   *  its workspace object in sync — `workspace.categories` shifts when
   *  the user toggles a category. */
  onUpdated: (workspace: Workspace) => void
}

/** Workspace category toggles — fetches the master list of available
 *  categories and shows an Enable / Enabled button per row. The toggle
 *  is server-driven so the user gets the canonical workspace back; the
 *  parent caches it through onUpdated. */
export function CategoriesSection({ workspace, onUpdated }: CategoriesSectionProps) {
  const { toast } = useToast()
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listCategories()
      .then((cats) => {
        if (!cancelled) setAllCategories(cats)
      })
      .catch(() => {
        // ignore — categories list isn't critical, just renders an empty card
      })
    return () => {
      cancelled = true
    }
  }, [])

  const enabledSlugs = new Set(workspace.categories.map((c) => c.slug))

  const handleToggle = async (slug: string, enabled: boolean) => {
    setTogglingSlug(slug)
    try {
      const updated = enabled
        ? await disableCategory(workspace.id, slug)
        : await enableCategory(workspace.id, slug)
      onUpdated(updated)
    } catch {
      toast({ title: "Failed to update category", variant: "destructive" })
    } finally {
      setTogglingSlug(null)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Categories</h2>
        <p className="text-sm text-muted-foreground">
          Choose which writing categories are available in this workspace
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 divide-y">
          {allCategories.map((cat) => {
            const enabled = enabledSlugs.has(cat.slug)
            const color = CATEGORY_COLORS[cat.slug]
            const isToggling = togglingSlug === cat.slug
            return (
              <div key={cat.slug} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <CategoryIcon slug={cat.slug} size={36} rounded={10} />
                  <div>
                    <p className="text-sm font-medium">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">{cat.description}</p>
                  </div>
                </div>
                <Button
                  variant={enabled ? "default" : "outline"}
                  size="sm"
                  disabled={isToggling}
                  onClick={() => handleToggle(cat.slug, enabled)}
                  style={
                    enabled && color ? { backgroundColor: color.ring, borderColor: color.ring } : undefined
                  }
                  className={cn("min-w-[80px]", enabled && "text-white hover:opacity-90")}
                >
                  {isToggling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : enabled ? (
                    "Enabled"
                  ) : (
                    "Enable"
                  )}
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
