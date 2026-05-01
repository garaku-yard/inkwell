"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, MoreHorizontal, UserPlus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
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
import { cn } from "@/lib/utils"
import {
  inviteMember,
  listMembers,
  removeMember,
  updateMemberRole,
  type WorkspaceMember,
} from "@/services/workspace"

interface MembersSectionProps {
  workspaceId: string
}

const ROLES = ["admin", "editor", "viewer"] as const
type Role = (typeof ROLES)[number]

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    editor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    viewer: "bg-muted text-muted-foreground",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        colors[role] ?? colors.viewer,
      )}
    >
      {role}
    </span>
  )
}

/** Workspace members panel — invite form, member list with role
 *  picker, remove-confirmation dialog. Owns its own data fetch and
 *  dialog state. Triggers a fetch on mount. */
export function MembersSection({ workspaceId }: MembersSectionProps) {
  const { toast } = useToast()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<Role>("editor")
  const [inviting, setInviting] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setMembersLoading(true)
    listMembers(workspaceId)
      .then((list) => {
        if (!cancelled) setMembers(list ?? [])
      })
      .catch(() => {
        if (!cancelled) toast({ title: "Failed to load members", variant: "destructive" })
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, toast])

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
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)))
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
      setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id))
      setRemoveTarget(null)
      toast({ title: "Member removed" })
    } catch {
      toast({ title: "Failed to remove member", variant: "destructive" })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Members</h2>
        <p className="text-sm text-muted-foreground">
          Manage who has access to this workspace
        </p>
      </div>

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
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" disabled={inviting || !inviteEmail.trim()}>
              {inviting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">Invite</span>
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Invite by email, <code className="font-mono">@username</code>, or
            <code className="font-mono">username#tag</code>. Usernames resolve via the identity service.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 divide-y">
          {membersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No members yet</p>
          ) : (
            members.map((member) => (
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
                      {ROLES.map((r) => (
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

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
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
