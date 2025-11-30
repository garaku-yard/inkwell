"use client"

import Link from "next/link"
import { BarChart3, Users, TrendingUp, Flame, MessageSquare, FileText, ChevronRight, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSearchParams } from 'next/navigation'

export default function AnalyticsPage() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project') || '272b597d-63c1-4b29-9150-c0cefd009987' // fallback ID
  const analyticsCards = [
    {
      href: "/analytics/overview",
      title: "Analytics Overview",
      description: "Comprehensive analysis of your script with key insights and recommendations",
      icon: BarChart3,
      stat: "Last analyzed 2h ago",
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
      iconBorder: "border-blue-500/30",
    },
    {
      href: "/analytics/character-voice",
      title: "Character Voice Profile",
      description: "Deep analysis of dialogue patterns, vocabulary complexity, and emotional range for each character",
      icon: Users,
      stat: "8 characters analyzed",
      iconColor: "text-purple-500",
      iconBg: "bg-purple-500/10",
      iconBorder: "border-purple-500/30",
    },
    {
      href: "/analytics/pacing",
      title: "Pacing & Tension Analysis",
      description:
        "Visual representation of dramatic flow, tension peaks, and narrative rhythm throughout your screenplay",
      icon: TrendingUp,
      stat: "Score: 87/100",
      iconColor: "text-green-500",
      iconBg: "bg-green-500/10",
      iconBorder: "border-green-500/30",
    },
    {
      href: "/analytics/conflict",
      title: "Conflict Heatmap",
      description: "Page-by-page visualization of conflict intensity with interactive scene filtering",
      icon: Flame,
      stat: "42 scenes mapped",
      iconColor: "text-orange-500",
      iconBg: "bg-orange-500/10",
      iconBorder: "border-orange-500/30",
    },
    {
      href: "/analytics/dialogue",
      title: "Dialogue Quality Analyzer",
      description: "Readability scores, naturalness analysis, and AI-powered suggestions for dialogue improvements",
      icon: MessageSquare,
      stat: "92% readability",
      iconColor: "text-cyan-500",
      iconBg: "bg-cyan-500/10",
      iconBorder: "border-cyan-500/30",
    },
    {
      href: "/analytics/scene-breakdown",
      title: "Scene Breakdown & Tagging",
      description: "Automated scene analysis with AI-generated beats, tags, and structural insights",
      icon: FileText,
      stat: "5 acts identified",
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-500/10",
      iconBorder: "border-indigo-500/30",
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/10">
      {/* Main Content */}
      <main className="flex-1">
        <div className="border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/30">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Midnight Star</h2>
                  <p className="text-xs text-muted-foreground">Feature Screenplay</p>
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
                AI-powered insights for professional screenwriting. Analyze character development, pacing, dialogue
                quality, and narrative structure.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pages</p>
                <p className="font-mono text-2xl font-bold text-foreground">120</p>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[82%] bg-primary"></div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">82% of target</p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Scenes</p>
                <p className="font-mono text-2xl font-bold text-foreground">42</p>
                <div className="mt-3 flex items-end gap-0.5">
                  {[60, 40, 80, 50, 90, 70, 85].map((height, i) => (
                    <div key={i} className="flex-1 rounded-sm bg-primary/20" style={{ height: `${height}%` }}></div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Avg. 2.9 pages/scene</p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Characters</p>
                <p className="font-mono text-2xl font-bold text-foreground">8</p>
                <div className="mt-3 flex gap-1">
                  <div className="h-1.5 flex-1 rounded-full bg-purple-500/70"></div>
                  <div className="h-1.5 flex-1 rounded-full bg-blue-500/70"></div>
                  <div className="h-1.5 flex-[0.5] rounded-full bg-green-500/70"></div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">3 primary, 5 supporting</p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quality Score</p>
                <p className="font-mono text-2xl font-bold text-foreground">
                  87<span className="text-base text-muted-foreground">/100</span>
                </p>
                <div className="mt-3 flex gap-1">
                  <div className="h-8 flex-1 rounded bg-primary/80"></div>
                  <div className="h-8 flex-1 rounded bg-primary/80"></div>
                  <div className="h-8 flex-1 rounded bg-primary/80"></div>
                  <div className="h-8 flex-1 rounded bg-primary/60"></div>
                  <div className="h-8 flex-1 rounded bg-muted"></div>
                </div>
                <p className="mt-1 text-xs text-green-600">+5 from last analysis</p>
              </div>
            </div>
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
                  <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-primary/5 transition-transform group-hover:scale-150"></div>

                  <div className="relative">
                    <div className="mb-4 flex items-start justify-between">
                      <div
                        className={`rounded-lg border-2 ${card.iconBorder} ${card.iconBg} p-2.5 transition-all group-hover:scale-105`}
                      >
                        <Icon className={`h-5 w-5 ${card.iconColor}`} />
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
                    </div>

                    <h3 className="mb-2 text-base font-semibold text-foreground group-hover:text-primary">
                      {card.title}
                    </h3>
                    <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{card.description}</p>

                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>
                      <span className="text-xs font-medium text-muted-foreground">{card.stat}</span>
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
