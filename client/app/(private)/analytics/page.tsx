"use client"

import Link from "next/link"
import { BarChart3, Users, TrendingUp, Flame, MessageSquare, FileText, ChevronRight, ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjectAnalytics } from "@/hooks/useProjectAnalytics"

export default function AnalyticsPage() {
  const { projectId, analytics, isLoading } = useProjectAnalytics()

  const analyticsCards = [
    {
      href: `/analytics/overview?project=${projectId}`,
      title: "Analytics Overview",
      description: "Comprehensive analysis of your script with key insights and recommendations",
      icon: BarChart3,
      stat: analytics ? `${analytics.totalScenes} scenes · ${analytics.totalWords.toLocaleString()} words` : "—",
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
      iconBorder: "border-blue-500/30",
    },
    {
      href: `/analytics/character-voice?project=${projectId}`,
      title: "Character Voice Profile",
      description: "Deep analysis of dialogue patterns, vocabulary complexity, and emotional range for each character",
      icon: Users,
      stat: analytics ? `${analytics.characters.length} characters analyzed` : "—",
      iconColor: "text-purple-500",
      iconBg: "bg-purple-500/10",
      iconBorder: "border-purple-500/30",
    },
    {
      href: `/analytics/pacing?project=${projectId}`,
      title: "Pacing Analysis",
      description: "Visual representation of dramatic flow and narrative rhythm throughout your screenplay",
      icon: TrendingUp,
      stat: analytics ? `${analytics.totalScenes} scenes mapped` : "—",
      iconColor: "text-green-500",
      iconBg: "bg-green-500/10",
      iconBorder: "border-green-500/30",
    },
    {
      href: `/analytics/conflict?project=${projectId}`,
      title: "Conflict Heatmap",
      description: "Scene-by-scene visualization of conflict and dialogue intensity",
      icon: Flame,
      stat: analytics ? `${analytics.totalScenes} scenes` : "—",
      iconColor: "text-orange-500",
      iconBg: "bg-orange-500/10",
      iconBorder: "border-orange-500/30",
    },
    {
      href: `/analytics/dialogue?project=${projectId}`,
      title: "Dialogue Analysis",
      description: "Character line distribution, vocabulary richness, and speaking patterns",
      icon: MessageSquare,
      stat: analytics ? `${analytics.totalDialogueLines} dialogue lines` : "—",
      iconColor: "text-cyan-500",
      iconBg: "bg-cyan-500/10",
      iconBorder: "border-cyan-500/30",
    },
    {
      href: `/analytics/scene-breakdown?project=${projectId}`,
      title: "Scene Breakdown",
      description: "Scene-by-scene analysis with locations, characters, and structure",
      icon: FileText,
      stat: analytics ? `${analytics.intScenes} INT · ${analytics.extScenes} EXT` : "—",
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-500/10",
      iconBorder: "border-indigo-500/30",
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/10">
      <main className="flex-1">
        <div className="border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/30">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {analytics?.projectTitle ?? (isLoading ? "Loading…" : "Project")}
                  </h2>
                  <p className="text-xs text-muted-foreground capitalize">
                    {analytics?.category?.replace("_", " ") ?? ""}
                  </p>
                </div>
              </div>
              <Link href={`/projects/${projectId}/editor`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Editor
                </Button>
              </Link>
            </div>

            <div className="mb-6">
              <h1 className="mb-2 text-3xl font-bold text-foreground">Script Analytics</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Analyse your script's structure, characters, dialogue, and pacing from real project data.
              </p>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-24 rounded-lg border border-border bg-card animate-pulse" />
                ))}
              </div>
            ) : analytics ? (
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Scenes</p>
                  <p className="font-mono text-2xl font-bold text-foreground">{analytics.totalScenes}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{analytics.intScenes} INT · {analytics.extScenes} EXT</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Words</p>
                  <p className="font-mono text-2xl font-bold text-foreground">{analytics.totalWords.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{analytics.totalActionWords.toLocaleString()} in action</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Characters</p>
                  <p className="font-mono text-2xl font-bold text-foreground">{analytics.characters.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{analytics.totalDialogueLines} dialogue lines</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Dialogue Ratio</p>
                  <p className="font-mono text-2xl font-bold text-foreground">{analytics.dialogueRatio}%</p>
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${analytics.dialogueRatio}%` }} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-8 py-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">Analysis Tools</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {analyticsCards.map((card) => {
              const Icon = card.icon
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group relative overflow-hidden rounded-lg border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-primary/5 transition-transform group-hover:scale-150" />
                  <div className="relative">
                    <div className="mb-4 flex items-start justify-between">
                      <div className={`rounded-lg border-2 ${card.iconBorder} ${card.iconBg} p-2.5 transition-all group-hover:scale-105`}>
                        <Icon className={`h-5 w-5 ${card.iconColor}`} />
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
                    </div>
                    <h3 className="mb-2 text-base font-semibold text-foreground group-hover:text-primary">{card.title}</h3>
                    <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{card.description}</p>
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="text-xs font-medium text-muted-foreground">
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : card.stat}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
