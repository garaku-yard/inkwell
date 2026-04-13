"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Film, BookOpen, Image, Feather, GitBranch, Dice6, User, Music, CheckCircle2, ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/AuthContext"
import { useWorkspace } from "@/lib/WorkspaceContext"
import { createPersonalWorkspaces, listCategories, type Category } from "@/services/workspace"
import { cn } from "@/lib/utils"

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  screenplay: Film,
  novel: BookOpen,
  comic_script: Image,
  poetry: Feather,
  interactive_fiction: GitBranch,
  tabletop_rpg: Dice6,
  memoir: User,
  lyrics: Music,
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const { refetch } = useWorkspace()

  const [categories, setCategories] = useState<Category[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFetchingCategories, setIsFetchingCategories] = useState(true)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login?next=/onboarding")
    }
  }, [isAuthenticated, authLoading, router])

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(console.error)
      .finally(() => setIsFetchingCategories(false))
  }, [])

  const toggle = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(slug) ? next.delete(slug) : next.add(slug)
      return next
    })
  }

  const handleSubmit = async () => {
    if (!user?.id || selected.size === 0) return
    setIsSubmitting(true)
    try {
      await createPersonalWorkspaces(user.id, Array.from(selected))
      await refetch()
      router.replace("/dashboard")
    } catch (err) {
      console.error("Failed to create workspaces:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (authLoading || isFetchingCategories) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl">

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3">What do you write?</h1>
          <p className="text-muted-foreground text-base">
            Select the formats you work in. Each one gets its own workspace with the right tools.
            You can always add more later.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.slug] ?? Film
            const isSelected = selected.has(cat.slug)
            return (
              <button
                key={cat.slug}
                onClick={() => toggle(cat.slug)}
                className={cn(
                  "relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-all duration-150",
                  "hover:border-primary/60 hover:bg-muted/50",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card"
                )}
              >
                {isSelected && (
                  <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-primary" />
                )}
                <Icon className={cn("h-7 w-7", isSelected ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className={cn("font-medium text-sm", isSelected ? "text-primary" : "")}>{cat.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{cat.description}</p>
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            className="gap-2 min-w-[200px]"
            disabled={selected.size === 0 || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Setting up workspaces...</>
            ) : (
              <> Get started <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
          {selected.size > 0 && (
            <p className="text-xs text-muted-foreground">
              {selected.size} workspace{selected.size > 1 ? "s" : ""} will be created
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
