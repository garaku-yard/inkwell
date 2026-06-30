"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Clock,
  Check,
  X,
  ArrowLeft,
  Mail,
  Loader2,
  FileText,
  Building2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import Link from "next/link"
import { getPendingInvites, acceptInvite, declineInvite, type Invitation } from "@/services/invites"
import {
  acceptOrgInvite,
  declineOrgInvite,
  listIncomingOrgInvites,
  type IncomingOrgInvite,
} from "@/services/organization"
import { useWorkspace } from "@/lib/WorkspaceContext"

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return "Just now"
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
  return date.toLocaleDateString()
}

export default function InvitesPage() {
  const [invites, setInvites] = useState<Invitation[]>([])
  const [orgInvites, setOrgInvites] = useState<IncomingOrgInvite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingInvites, setProcessingInvites] = useState<Set<string>>(new Set())
  const router = useRouter()
  const { refetch: refetchWorkspaces, setActiveOrg } = useWorkspace()

  useEffect(() => {
    let cancelled = false
    const load = (showSpinner: boolean) => {
      if (showSpinner) setIsLoading(true)
      Promise.all([
        getPendingInvites().catch((err) => {
          console.error("Failed to fetch invites:", err)
          return [] as Invitation[]
        }),
        listIncomingOrgInvites().catch((err) => {
          console.error("Failed to fetch org invites:", err)
          return [] as IncomingOrgInvite[]
        }),
      ])
        .then(([projectInvites, incomingOrg]) => {
          if (cancelled) return
          setInvites(projectInvites)
          setOrgInvites(incomingOrg)
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false)
        })
    }
    load(true)
    // Pick up invites that land while this page is already open — refresh on
    // focus (no spinner flash) instead of requiring a manual reload.
    const onFocus = () => load(false)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      cancelled = true
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [])

  const handleOrgInviteAction = async (token: string, accepted: boolean) => {
    setProcessingInvites((prev) => new Set(prev).add(token))
    try {
      if (accepted) {
        const org = await acceptOrgInvite(token)
        await refetchWorkspaces()
        setActiveOrg(org)
        router.push("/dashboard")
      } else {
        await declineOrgInvite(token)
        setOrgInvites((prev) => prev.filter((i) => i.token !== token))
      }
    } catch (error) {
      console.error(`Failed to ${accepted ? "accept" : "decline"} org invite:`, error)
    } finally {
      setProcessingInvites((prev) => {
        const next = new Set(prev)
        next.delete(token)
        return next
      })
    }
  }

  const handleInviteAction = async (invitationId: string, projectId: string, accepted: boolean) => {
    setProcessingInvites((prev) => new Set(prev).add(invitationId))
    try {
      if (accepted) {
        await acceptInvite(invitationId)
      } else {
        await declineInvite(invitationId)
      }
      setInvites((prevInvites) => prevInvites.filter((invite) => invite.id !== invitationId))
      if (accepted) {
        router.push(`/projects/editor?id=${projectId}`)
      }
    } catch (error) {
      console.error(`Failed to ${accepted ? 'accept' : 'decline'} invite:`, error)
    } finally {
      setProcessingInvites((prev) => {
        const newSet = new Set(prev)
        newSet.delete(invitationId)
        return newSet
      })
    }
  }

  const InviteCard = ({ invite }: { invite: Invitation }) => {
    const isProcessing = processingInvites.has(invite.id)

    return (
      <Card className="group hover:shadow-lg hover:-translate-y-1 transition-all duration-200 border-border/50 h-full flex flex-col overflow-hidden">
        <CardHeader className="pb-3 flex-shrink-0 relative">
          <div className="absolute top-0 left-0 right-0 h-1 rounded-t-lg bg-yellow-400" />
          <div className="flex items-start justify-between mb-3 pt-1">
            <Badge variant="outline" className="text-xs font-medium bg-yellow-50 text-yellow-700 border-yellow-200">
              Pending
            </Badge>
            <Badge variant="outline" className="text-xs text-muted-foreground bg-muted/50 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Screenplay
            </Badge>
          </div>
          <h3 className="font-semibold text-base line-clamp-2 text-foreground mb-2 min-h-[2.5rem] group-hover:text-primary transition-colors">
            {invite.projectName}
          </h3>
        </CardHeader>

        <CardContent className="flex-1 pt-0 pb-3">
          <div className="flex items-center gap-3 mb-4 p-2 rounded-lg bg-muted/30 border border-border/30">
            <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
              <AvatarFallback className="text-sm bg-primary/10 text-primary font-semibold">
                {invite.invitedBy?.charAt(0)?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{invite.invitedBy || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">Project Owner</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/20 rounded-md px-2 py-1">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Invited {formatRelativeTime(invite.createdAt)}</span>
            </div>
          </div>
        </CardContent>

        <CardContent className="pt-0 bg-gradient-to-t from-muted/30 to-transparent flex-shrink-0">
          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 border-border/50 bg-transparent transition-colors"
              onClick={() => handleInviteAction(invite.id, invite.projectId, false)}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              <span className="ml-1 hidden sm:inline">Decline</span>
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 shadow-sm"
              onClick={() => handleInviteAction(invite.id, invite.projectId, true)}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              <span className="ml-1 hidden sm:inline">Accept</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const OrgInviteCard = ({ invite }: { invite: IncomingOrgInvite }) => {
    const isProcessing = processingInvites.has(invite.token)
    return (
      <Card className="group hover:shadow-md transition-shadow border-border/60 flex flex-col">
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" />
            </span>
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs font-medium">
              Pending
            </Badge>
          </div>

          <div>
            <h3 className="font-semibold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {invite.org_name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Organization · invited as <span className="font-medium capitalize text-foreground">{invite.role}</span>
            </p>
          </div>

          <div className="mt-auto flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50"
              onClick={() => handleOrgInviteAction(invite.token, false)}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              <span className="ml-1">Decline</span>
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => handleOrgInviteAction(invite.token, true)}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              <span className="ml-1">Accept</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalInvites = invites.length + orgInvites.length

  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <h1 className="text-lg font-semibold text-foreground">Invitations</h1>
                {totalInvites > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {totalInvites} pending invitation{totalInvites !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {orgInvites.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-medium text-muted-foreground mb-3">Organizations</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {orgInvites.map((invite) => (
                    <OrgInviteCard key={invite.token} invite={invite} />
                  ))}
                </div>
              </section>
            )}
            {invites.length > 0 ? (
              <section>
                {orgInvites.length > 0 && <h2 className="text-sm font-medium text-muted-foreground mb-3">Projects</h2>}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                  {invites.map((invite) => (
                    <InviteCard key={invite.id} invite={invite} />
                  ))}
                </div>
              </section>
            ) : orgInvites.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
                  <Mail className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No pending invitations</h3>
                <p className="text-muted-foreground mb-4">
                  You&apos;re all caught up! New project invitations will appear here.
                </p>
                <Link href="/dashboard">
                  <Button variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </Link>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}
