"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Settings2, Tag, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useWorkspace } from "@/lib/WorkspaceContext"
import { getWorkspace, type Workspace } from "@/services/workspace"
import { GeneralSection } from "@/components/workspace/settings/GeneralSection"
import { MembersSection } from "@/components/workspace/settings/MembersSection"
import { CategoriesSection } from "@/components/workspace/settings/CategoriesSection"
import { PaneSpinner } from "@/components/shared/PaneSpinner"
import { cn } from "@/lib/utils"

type Section = "general" | "members" | "categories"

export default function WorkspaceSettingsPage() {
  const searchParams = useSearchParams()
  const workspaceId = searchParams.get("id") ?? ""
  const router = useRouter()
  const { toast } = useToast()
  const { refetch } = useWorkspace()

  const [section, setSection] = useState<Section>("general")
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ws = await getWorkspace(workspaceId)
      setWorkspace(ws)
    } catch {
      toast({ title: "Failed to load workspace", variant: "destructive" })
      router.back()
    } finally {
      setLoading(false)
    }
  }, [workspaceId, router, toast])

  useEffect(() => {
    void load()
  }, [load])

  const handleSectionUpdate = useCallback(
    (updated: Workspace) => {
      setWorkspace(updated)
      refetch()
    },
    [refetch],
  )

  const handleDeleted = useCallback(() => {
    refetch()
    router.push("/dashboard")
  }, [refetch, router])

  if (loading) {
    return <PaneSpinner />
  }

  if (!workspace) return null

  const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Settings2 className="h-4 w-4" /> },
    { id: "members", label: "Members", icon: <Users className="h-4 w-4" /> },
    { id: "categories", label: "Categories", icon: <Tag className="h-4 w-4" /> },
  ]

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-base font-semibold">{workspace.name}</h1>
          <p className="text-xs text-muted-foreground">Workspace Settings</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-52 shrink-0 border-r p-4 flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors text-left",
                section === item.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-8">
          {section === "general" && (
            <GeneralSection
              workspace={workspace}
              onUpdated={handleSectionUpdate}
              onDeleted={handleDeleted}
            />
          )}
          {section === "members" && <MembersSection workspaceId={workspace.id} />}
          {section === "categories" && (
            <CategoriesSection workspace={workspace} onUpdated={handleSectionUpdate} />
          )}
        </main>
      </div>
    </div>
  )
}
