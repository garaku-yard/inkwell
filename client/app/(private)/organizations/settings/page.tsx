"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Building2, Loader2, MoreHorizontal, Settings2, Trash2, UserPlus, Users, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { useToast } from "@/hooks/use-toast"
import { useWorkspace } from "@/lib/WorkspaceContext"
import { useAuth } from "@/lib/AuthContext"
import { cn } from "@/lib/utils"
import { PaneSpinner } from "@/components/shared/PaneSpinner"
import { FullPageSpinner } from "@/components/shared/FullPageSpinner"
import {
  deleteOrganization,
  getOrgSeats,
  getOrganization,
  inviteOrgMember,
  listOrgMembers,
  removeOrgMember,
  updateOrganization,
  updateOrgMemberRole,
  type Organization,
  type OrgMember,
  type OrgRole,
  type OrgSeatInfo,
} from "@/services/organization"

type Section = "general" | "members"
const INVITE_ROLES: OrgRole[] = ["admin", "editor", "viewer"]

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

function OrgSettingsContent() {
  const searchParams = useSearchParams()
  const orgId = searchParams.get("id") ?? ""
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const { refetch, setActiveOrg } = useWorkspace()

  const [section, setSection] = useState<Section>("general")
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOrg(await getOrganization(orgId))
    } catch {
      toast({ title: "Failed to load organization", variant: "destructive" })
      router.back()
    } finally {
      setLoading(false)
    }
  }, [orgId, router, toast])

  useEffect(() => {
    if (orgId) void load()
  }, [orgId, load])

  if (loading) return <PaneSpinner />
  if (!org) return null

  const canManage = org.member_role === "owner" || org.member_role === "admin"
  const isOwner = org.member_role === "owner"

  const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Settings2 className="h-4 w-4" /> },
    { id: "members", label: "Members", icon: <Users className="h-4 w-4" /> },
  ]

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <h1 className="text-base font-semibold">{org.name}</h1>
            <p className="text-xs text-muted-foreground">Organization Settings</p>
          </div>
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
                section === item.id ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
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
              org={org}
              canManage={canManage}
              isOwner={isOwner}
              onUpdated={setOrg}
              onDeleted={() => {
                setActiveOrg(null)
                refetch()
                router.push("/dashboard")
              }}
            />
          )}
          {section === "members" && (
            <MembersSection orgId={org.id} canManage={canManage} currentUserId={user?.id} onMembershipChange={refetch} />
          )}
        </main>
      </div>
    </div>
  )
}

function GeneralSection({
  org,
  canManage,
  isOwner,
  onUpdated,
  onDeleted,
}: {
  org: Organization
  canManage: boolean
  isOwner: boolean
  onUpdated: (org: Organization) => void
  onDeleted: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(org.name)
  const [description, setDescription] = useState(org.description ?? "")
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const updated = await updateOrganization(org.id, { name: name.trim(), description: description.trim() })
      onUpdated({ ...org, ...updated })
      toast({ title: "Organization updated" })
    } catch {
      toast({ title: "Failed to update organization", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      await deleteOrganization(org.id)
      onDeleted()
    } catch {
      toast({ title: "Failed to delete organization", variant: "destructive" })
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">Basic organization information</p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage || saving} placeholder="Organization name" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canManage || saving} placeholder="What is this organization for?" />
          </div>
          {canManage && (
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/40">
          <CardContent className="space-y-3 pt-6">
            <div>
              <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
              <p className="text-sm text-muted-foreground">Permanently delete this organization and remove every member.</p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete organization
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {org.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the organization and every membership. Projects owned by the org are not deleted but will no longer be reachable through it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MembersSection({
  orgId,
  canManage,
  currentUserId,
  onMembershipChange,
}: {
  orgId: string
  canManage: boolean
  currentUserId?: string
  onMembershipChange: () => void
}) {
  const { toast } = useToast()
  const [members, setMembers] = useState<OrgMember[]>([])
  const [seats, setSeats] = useState<OrgSeatInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState("")
  const [role, setRole] = useState<OrgRole>("editor")
  const [inviting, setInviting] = useState(false)
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [m, s] = await Promise.all([listOrgMembers(orgId), getOrgSeats(orgId)])
      setMembers(m)
      setSeats(s)
    } catch {
      toast({ title: "Failed to load members", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [orgId, toast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const invite = async () => {
    if (!target.trim()) return
    setInviting(true)
    try {
      await inviteOrgMember(orgId, target.trim(), role)
      toast({ title: "Invitation sent", description: `${target.trim()} can accept it from their invitations inbox.` })
      setTarget("")
      await refresh()
      onMembershipChange()
    } catch (err) {
      toast({ title: "Could not invite", description: err instanceof Error ? err.message : undefined, variant: "destructive" })
    } finally {
      setInviting(false)
    }
  }

  const changeRole = async (m: OrgMember, next: OrgRole) => {
    setBusyUser(m.user_id)
    try {
      await updateOrgMemberRole(orgId, m.user_id, next)
      setMembers((prev) => prev.map((x) => (x.user_id === m.user_id ? { ...x, role: next } : x)))
    } catch {
      toast({ title: "Could not change role", variant: "destructive" })
    } finally {
      setBusyUser(null)
    }
  }

  const remove = async () => {
    if (!removeTarget) return
    setBusyUser(removeTarget.user_id)
    try {
      await removeOrgMember(orgId, removeTarget.user_id)
      setRemoveTarget(null)
      await refresh()
      onMembershipChange()
    } catch {
      toast({ title: "Could not remove member", variant: "destructive" })
    } finally {
      setBusyUser(null)
    }
  }

  const used = seats ? seats.members + seats.pending : members.length
  const full = seats ? used >= seats.total : false

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Members</h2>
        <p className="text-sm text-muted-foreground">People in this organization and the seats they use</p>
      </div>

      {seats && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{seats.members}</span>
              <span className="text-muted-foreground">member{seats.members === 1 ? "" : "s"}</span>
              {seats.pending > 0 && <span className="text-muted-foreground">· {seats.pending} pending</span>}
            </div>
            <div className="text-sm">
              <span className={cn("font-medium", full && "text-destructive")}>{used}</span>
              <span className="text-muted-foreground"> of {seats.total} seats used</span>
            </div>
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <label className="text-sm font-medium">Invite a member</label>
            <div className="flex gap-2">
              <Input
                placeholder="email or username#tag"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !inviting && !full) invite() }}
                disabled={inviting || full}
              />
              <select
                className="rounded-md border bg-background px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
                disabled={inviting || full}
                aria-label="Invite role"
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">{r}</option>
                ))}
              </select>
              <Button onClick={invite} disabled={inviting || full || !target.trim()}>
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="mr-2 h-4 w-4" />Invite</>}
              </Button>
            </div>
            {full && <p className="text-xs text-destructive">All {seats?.total} seats are in use. Remove a member to free one.</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="divide-y pt-2">
          {loading ? (
            <div className="py-8"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            members.map((m) => {
              const label = m.name || m.email || m.user_id
              const isSelf = m.user_id === currentUserId
              return (
                <div key={m.user_id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{label}{isSelf && <span className="text-muted-foreground"> (you)</span>}</p>
                    {m.email && m.name && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <RoleBadge role={m.role} />
                    {canManage && m.role !== "owner" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busyUser === m.user_id}>
                            {busyUser === m.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {INVITE_ROLES.filter((r) => r !== m.role).map((r) => (
                            <DropdownMenuItem key={r} onClick={() => changeRole(m, r)} className="capitalize">
                              Make {r}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem onClick={() => setRemoveTarget(m)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                            <X className="mr-2 h-4 w-4" />
                            Remove from org
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.name || removeTarget?.email || "This member"} will lose access to the organization and its projects. They can be re-invited later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function OrganizationSettingsPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <OrgSettingsContent />
    </Suspense>
  )
}
