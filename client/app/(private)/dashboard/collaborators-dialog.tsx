"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Mail, MoreHorizontal, Crown, Edit3, Eye, UserMinus, Users, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  addCollaborator,
  getProjectCollaborators,
  updateCollaboratorRole,
  removeCollaborator,
} from "@/services/project"
import { type CollaboratorRole, collaboratorRoleOptions } from "@/models/constants/collaboratorRoles"

interface Collaborator {
  id: string
  name: string
  email: string
  usernameWithTag: string
  avatar?: string
  role: CollaboratorRole
  status: "active" | "pending"
  joinedAt: string
}

interface CollaboratorsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
}

const roleConfig = {
  REVIEWER: {
    label: "Reviewer",
    icon: Eye,
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
    description: "Can view and comment on the screenplay",
  },
  EDITOR: {
    label: "Editor",
    icon: Edit3,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100",
    description: "Can edit and comment on the screenplay",
  },
  WRITER: {
    label: "Writer",
    icon: Crown,
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100",
    description: "Full access to project and settings",
  },
}

export function CollaboratorsDialog({ open, onOpenChange, projectId, projectName }: CollaboratorsDialogProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [inviteUsernameWithTag, setInviteUsernameWithTag] = useState("")
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("EDITOR")
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (open && projectId) {
      fetchCollaborators()
    }
  }, [open, projectId])

  const fetchCollaborators = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const projectCollaborators = await getProjectCollaborators(projectId)
      setCollaborators(projectCollaborators)
    } catch (err: any) {
      setError("Failed to load collaborators")
      console.error("Error fetching collaborators:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInviteCollaborator = async () => {
    if (!inviteUsernameWithTag.trim()) return

    if (!inviteUsernameWithTag.includes("#")) {
      setError("Please enter username in format: username#tag")
      return
    }

    const alreadyInvited = collaborators.some(
      (c) => c.usernameWithTag.toLowerCase() === inviteUsernameWithTag.trim().toLowerCase(),
    )

    if (alreadyInvited) {
      setError("This user is already a collaborator.")
      return
    }

    setIsInviting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      await addCollaborator(projectId, inviteUsernameWithTag.trim(), inviteRole)
      setSuccessMessage(`Invitation sent to ${inviteUsernameWithTag}`)
      setInviteUsernameWithTag("")
      setInviteRole("EDITOR")
      await fetchCollaborators()
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err: any) {
      setError(err.message || "Failed to invite collaborator")
    } finally {
      setIsInviting(false)
    }
  }

  const handleRoleChange = async (collaboratorId: string, newRole: CollaboratorRole) => {
    try {
      await updateCollaboratorRole(projectId, collaboratorId, newRole)
      setCollaborators((prev) =>
        prev.map((collab) => (collab.id === collaboratorId ? { ...collab, role: newRole } : collab)),
      )
    } catch (err: any) {
      setError("Failed to update collaborator role")
      console.error("Error updating role:", err)
    }
  }

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    try {
      await removeCollaborator(projectId, collaboratorId)
      setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId))
    } catch (err: any) {
      setError("Failed to remove collaborator")
      console.error("Error removing collaborator:", err)
    }
  }

  const hasCollaborators = (collaborators ?? []).length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manage Collaborators
          </DialogTitle>
          <DialogDescription>Invite team members and manage their roles for "{projectName}"</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Invite Section */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
            <h3 className="font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Invite Collaborator
            </h3>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {successMessage && (
              <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="usernameWithTag" className="sr-only">
                  Username#Tag
                </Label>
                <Input
                  id="usernameWithTag"
                  placeholder="Enter username#tag (e.g., johndoe#1234)"
                  value={inviteUsernameWithTag}
                  onChange={(e) => {
                    setInviteUsernameWithTag(e.target.value)
                    setError(null)
                  }}
                  onKeyDown={(e) => e.key === "Enter" && !isInviting && handleInviteCollaborator()}
                />
              </div>
              <Select value={inviteRole} onValueChange={(value: CollaboratorRole) => setInviteRole(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue>
                    {inviteRole && (
                      <div className="flex items-center gap-2">
                        {(() => {
                          const role = roleConfig[inviteRole]
                          const Icon = role.icon
                          return (
                            <>
                              <Icon className="h-4 w-4" />
                              <span>{role.label}</span>
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="w-[280px]">
                  {collaboratorRoleOptions.map((option) => {
                    const role = roleConfig[option.value as CollaboratorRole]
                    return (
                      <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <role.icon className="h-4 w-4" />
                          <div className="flex flex-col">
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs text-muted-foreground">{role.description}</span>
                          </div>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <Button onClick={handleInviteCollaborator} disabled={!inviteUsernameWithTag.trim() || isInviting}>
                {isInviting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                {isInviting ? "Inviting..." : "Invite"}
              </Button>
            </div>
          </div>

          {/* Collaborators List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : hasCollaborators ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="font-medium text-sm">Current Collaborators ({collaborators.length})</h3>
                <ScrollArea className="max-h-64">
                  <div className="space-y-2">
                    {collaborators.map((collab) => {
                      const roleStyle = roleConfig[collab.role]
                      const isWriter = collab.role === "WRITER"
                      return (
                        <div
                          key={collab.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={collab.avatar || "/placeholder.svg"} alt={collab.name} />
                              <AvatarFallback>
                                {collab.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>

                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{collab.name}</p>
                                {collab.status === "pending" && (
                                  <Badge variant="outline" className="text-xs">
                                    Pending
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{collab.usernameWithTag}</p>
                              <p className="text-xs text-muted-foreground">{collab.email}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge className={cn("flex items-center gap-1", roleStyle.color)}>
                              <roleStyle.icon className="h-3 w-3" />
                              {roleStyle.label}
                            </Badge>

                            {!isWriter && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {collaboratorRoleOptions
                                    .filter((option) => option.value !== collab.role)
                                    .map((option) => {
                                      const OptionIcon = roleConfig[option.value as CollaboratorRole].icon
                                      return (
                                        <DropdownMenuItem
                                          key={option.value}
                                          onClick={() => handleRoleChange(collab.id, option.value as CollaboratorRole)}
                                        >
                                          <OptionIcon className="h-4 w-4 mr-2" />
                                          Make {option.label}
                                        </DropdownMenuItem>
                                      )
                                    })}
                                  <Separator />
                                  <DropdownMenuItem
                                    onClick={() => handleRemoveCollaborator(collab.id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <UserMinus className="h-4 w-4 mr-2" />
                                    Remove Access
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            </>
          ) : (
            !isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No collaborators yet</p>
                <p className="text-sm">Invite team members to start collaborating on this project</p>
              </div>
            )
          )}

          {/* Role Descriptions */}
          <div className="space-y-2 p-4 bg-muted/20 rounded-lg">
            <h4 className="font-medium text-sm">Role Permissions</h4>
            <div className="space-y-1 text-xs text-muted-foreground">
              {Object.entries(roleConfig).map(([role, config]) => (
                <div key={role} className="flex items-center gap-2">
                  <config.icon className="h-3 w-3" />
                  <span className="font-medium">{config.label}:</span>
                  <span>{config.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
