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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import Link from "next/link"
import { getPendingInvites, acceptInvite, declineInvite, type Invitation } from "@/services/invites"

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
  const [isLoading, setIsLoading] = useState(true)
  const [processingInvites, setProcessingInvites] = useState<Set<string>>(new Set())
  const router = useRouter()

  useEffect(() => {
    setIsLoading(true)
    getPendingInvites()
      .then(setInvites)
      .catch((err) => {
        console.error("Failed to fetch invites:", err)
      })
      .finally(() => setIsLoading(false))
  }, [])

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

  return (
    <div className="min-h-screen bg-background">
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
                <h1 className="text-lg font-semibold text-foreground">Project Invitations</h1>
                {invites.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {invites.length} pending invitation{invites.length !== 1 ? "s" : ""}
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
            {invites.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                {invites.map((invite) => (
                  <InviteCard key={invite.id} invite={invite} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
                  <Mail className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No pending invitations</h3>
                <p className="text-muted-foreground mb-4">
                  You're all caught up! New project invitations will appear here.
                </p>
                <Link href="/dashboard">
                  <Button variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
