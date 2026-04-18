"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Settings2, Users, Tag, Trash2, Loader2, UserPlus, MoreHorizontal, Check, X, Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { useWorkspace } from "@/lib/WorkspaceContext"
import {
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listMembers,
  inviteMember,
  removeMember,
  updateMemberRole,
  listCategories,
  enableCategory,
  disableCategory,
  type Workspace,
  type WorkspaceMember,
  type Category,
} from "@/services/workspace"
import { CategoryIcon, CATEGORY_COLORS } from "@/components/workspace/CategoryIcon"
import { cn } from "@/lib/utils"

function workspaceInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()
}

type Section = "general" | "members" | "categories"

const ROLES = ["admin", "editor", "viewer"] as const
type Role = typeof ROLES[number]

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    editor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    viewer: "bg-muted text-muted-foreground",
  }
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize", colors[role] ?? colors.viewer)}>
      {role}
    </span>
  )
}

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const { refetch, setActiveWorkspace } = useWorkspace()

  const [section, setSection] = useState<Section>("general")
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)

  // General
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Members
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<Role>("editor")
  const [inviting, setInviting] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null)
  const [removing, setRemoving] = useState(false)

  // Categories
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ws = await getWorkspace(workspaceId)
      setWorkspace(ws)
      setName(ws.name)
      setDescription(ws.description ?? "")
    } catch {
      toast({ title: "Failed to load workspace", variant: "destructive" })
      router.back()
    } finally {
      setLoading(false)
    }
  }, [workspaceId, router, toast])

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const list = await listMembers(workspaceId)
      setMembers(list ?? [])
    } catch {
      toast({ title: "Failed to load members", variant: "destructive" })
    } finally {
      setMembersLoading(false)
    }
  }, [workspaceId, toast])

  const loadCategories = useCallback(async () => {
    try {
      const cats = await listCategories()
      setAllCategories(cats)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (section === "members") loadMembers() }, [section, loadMembers])
  useEffect(() => { if (section === "categories") loadCategories() }, [section, loadCategories])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateWorkspace(workspaceId, { name, description })
      setWorkspace(updated)
      refetch()
      toast({ title: "Workspace updated" })
    } catch {
      toast({ title: "Failed to save changes", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const updated = await updateWorkspace(workspaceId, { avatar_url: dataUrl })
      setWorkspace(updated)
      refetch()
      toast({ title: "Avatar updated" })
    } catch {
      toast({ title: "Failed to upload avatar", variant: "destructive" })
    } finally {
      setAvatarUploading(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ""
    }
  }

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true)
    try {
      const updated = await updateWorkspace(workspaceId, { avatar_url: "" })
      setWorkspace(updated)
      refetch()
      toast({ title: "Avatar removed" })
    } catch {
      toast({ title: "Failed to remove avatar", variant: "destructive" })
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteWorkspace(workspaceId)
      refetch()
      toast({ title: "Workspace deleted" })
      router.push("/dashboard")
    } catch {
      toast({ title: "Failed to delete workspace", variant: "destructive" })
      setDeleting(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      await inviteMember(workspaceId, inviteEmail.trim(), inviteRole)
      setInviteEmail("")
      toast({ title: "Invite sent", description: `An invitation was sent to ${inviteEmail.trim()}` })
    } catch {
      toast({ title: "Failed to send invite", variant: "destructive" })
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (member: WorkspaceMember, role: Role) => {
    try {
      await updateMemberRole(workspaceId, member.user_id, role)
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role } : m))
      toast({ title: "Role updated" })
    } catch {
      toast({ title: "Failed to update role", variant: "destructive" })
    }
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      await removeMember(workspaceId, removeTarget.user_id)
      setMembers(prev => prev.filter(m => m.id !== removeTarget.id))
      setRemoveTarget(null)
      toast({ title: "Member removed" })
    } catch {
      toast({ title: "Failed to remove member", variant: "destructive" })
    } finally {
      setRemoving(false)
    }
  }

  const handleToggleCategory = async (slug: string, enabled: boolean) => {
    setTogglingSlug(slug)
    try {
      const updated = enabled
        ? await disableCategory(workspaceId, slug)
        : await enableCategory(workspaceId, slug)
      setWorkspace(updated)
      refetch()
    } catch {
      toast({ title: "Failed to update category", variant: "destructive" })
    } finally {
      setTogglingSlug(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const enabledSlugs = new Set(workspace?.categories.map(c => c.slug) ?? [])

  const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Settings2 className="h-4 w-4" /> },
    { id: "members", label: "Members", icon: <Users className="h-4 w-4" /> },
    { id: "categories", label: "Categories", icon: <Tag className="h-4 w-4" /> },
  ]

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-base font-semibold">{workspace?.name}</h1>
          <p className="text-xs text-muted-foreground">Workspace Settings</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-52 shrink-0 border-r p-4 flex flex-col gap-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors text-left",
                section === item.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          {section === "general" && (
            <div className="max-w-xl space-y-6">
              <div>
                <h2 className="text-lg font-semibold">General</h2>
                <p className="text-sm text-muted-foreground">Basic workspace information</p>
              </div>

              <Card>
                <CardContent className="pt-6 space-y-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-5">
                    <div className="relative">
                      {workspace?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={workspace.avatar_url}
                          alt={workspace.name}
                          className="h-16 w-16 rounded-[18px] object-cover border border-border"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-[18px] bg-muted flex items-center justify-center border border-border text-lg font-bold text-muted-foreground">
                          {workspaceInitials(name || workspace?.name || "?")}
                        </div>
                      )}
                      {avatarUploading && (
                        <div className="absolute inset-0 rounded-[18px] bg-background/70 flex items-center justify-center">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={avatarUploading}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {workspace?.avatar_url ? "Change photo" : "Upload photo"}
                      </Button>
                      {workspace?.avatar_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground text-xs"
                          disabled={avatarUploading}
                          onClick={handleRemoveAvatar}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ws-name">Name</Label>
                    <Input
                      id="ws-name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Workspace name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ws-desc">Description</Label>
                    <Input
                      id="ws-desc"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="What is this workspace for?"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={saving} size="sm">
                      {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Save changes
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Separator />

              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
                  <CardDescription>Permanently delete this workspace and all its data.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete workspace
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {section === "members" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Members</h2>
                <p className="text-sm text-muted-foreground">Manage who has access to this workspace</p>
              </div>

              {/* Invite form */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Invite member</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleInvite} className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Email, @username, or username#tag"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      className="flex-1"
                    />
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as Role)}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" disabled={inviting || !inviteEmail.trim()}>
                      {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      <span className="ml-1.5">Invite</span>
                    </Button>
                  </form>
                  <p className="text-xs text-muted-foreground mt-2">
                    Invite by email, <code className="font-mono">@username</code>, or
                    <code className="font-mono">username#tag</code>. Usernames resolve via the identity service.
                  </p>
                </CardContent>
              </Card>

              {/* Member list */}
              <Card>
                <CardContent className="pt-4 divide-y">
                  {membersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : members.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No members yet</p>
                  ) : (
                    members.map(member => (
                      <div key={member.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                            {member.user_id.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{member.user_id}</p>
                            <RoleBadge role={member.role} />
                          </div>
                        </div>
                        {member.role !== "owner" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              {ROLES.map(r => (
                                <DropdownMenuItem
                                  key={r}
                                  onClick={() => handleRoleChange(member, r)}
                                  className="gap-2 capitalize"
                                >
                                  {member.role === r && <Check className="h-3.5 w-3.5" />}
                                  {member.role !== r && <span className="w-3.5" />}
                                  {r}
                                </DropdownMenuItem>
                              ))}
                              <Separator className="my-1" />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive gap-2"
                                onClick={() => setRemoveTarget(member)}
                              >
                                <X className="h-3.5 w-3.5" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {section === "categories" && (
            <div className="max-w-xl space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Categories</h2>
                <p className="text-sm text-muted-foreground">Choose which writing categories are available in this workspace</p>
              </div>

              <Card>
                <CardContent className="pt-4 divide-y">
                  {allCategories.map(cat => {
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
                          onClick={() => handleToggleCategory(cat.slug, enabled)}
                          style={enabled && color ? { backgroundColor: color.ring, borderColor: color.ring } : undefined}
                          className={cn("min-w-[80px]", enabled && "text-white hover:opacity-90")}
                        >
                          {isToggling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : enabled ? "Enabled" : "Enable"}
                        </Button>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      {/* Delete workspace confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{workspace?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the workspace and all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove member confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={open => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              This member will lose access to the workspace immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
