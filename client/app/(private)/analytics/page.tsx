"use client"

import Link from "next/link"
import { BarChart3, Users, TrendingUp, Flame, MessageSquare, FileText, ChevronRight, ArrowLeft, Loader2, BookOpen, Mic2, Layers, GitBranch, Dices } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjectAnalytics } from "@/hooks/useProjectAnalytics"
import type { ScriptAnalytics } from "@/lib/analytics"
import { getCategoryStructure } from "@/lib/helpers/category-structure"

// ── Category-specific top stats ────────────────────────────────────────────

function TopStats({ analytics }: { analytics: ScriptAnalytics }) {
  const cat = analytics.category
  const s = getCategoryStructure(cat)

  if (cat === "screenplay") {
    return (
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Scenes" value={analytics.totalScenes} sub={`${analytics.intScenes} INT · ${analytics.extScenes} EXT`} />
        <Stat label="Words" value={analytics.totalWords.toLocaleString()} sub={`${analytics.totalActionWords.toLocaleString()} in action`} />
        <Stat label="Characters" value={analytics.characters.length} sub={`${analytics.totalDialogueLines} dialogue lines`} />
        <StatBar label="Dialogue Ratio" value={analytics.dialogueRatio} />
      </div>
    )
  }

  if (cat === "novel" || cat === "memoir") {
    return (
      <div className="grid grid-cols-4 gap-4">
        <Stat label={s.unitLabelPlural} value={analytics.totalScenes} sub={`avg ${analytics.avgWordsPerScene.toLocaleString()} words each`} />
        <Stat label="Total words" value={analytics.totalWords.toLocaleString()} sub={analytics.longestSceneHeading ? `longest: "${analytics.longestSceneHeading}"` : ""} />
        <Stat label="Paragraphs" value={(analytics.elementsByType["paragraph"] ?? 0).toLocaleString()} sub="" />
        <Stat label="Avg words / chapter" value={analytics.avgWordsPerScene.toLocaleString()} sub="" />
      </div>
    )
  }

  if (cat === "poetry" || cat === "lyrics") {
    const lines = analytics.elementsByType["line"] ?? 0
    const breaks = analytics.elementsByType["stanza_break"] ?? analytics.elementsByType["scene_break"] ?? 0
    const sections = analytics.elementsByType["section_label"] ?? 0
    return (
      <div className="grid grid-cols-4 gap-4">
        <Stat label={cat === "lyrics" ? "Songs" : "Poems"} value={analytics.totalScenes} sub="" />
        <Stat label="Lines" value={lines} sub={breaks > 0 ? `${breaks} stanza breaks` : ""} />
        <Stat label="Words" value={analytics.totalWords.toLocaleString()} sub="" />
        {cat === "lyrics"
          ? <Stat label="Sections" value={sections} sub="verse, chorus, bridge…" />
          : <Stat label="Avg lines / poem" value={analytics.totalScenes > 0 ? Math.round(lines / analytics.totalScenes) : 0} sub="" />
        }
      </div>
    )
  }

  if (cat === "comic") {
    const panels = analytics.elementsByType["panel"] ?? 0
    const balloons = analytics.elementsByType["balloon"] ?? 0
    const captions = analytics.elementsByType["caption"] ?? 0
    return (
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Pages" value={analytics.totalScenes} sub="" />
        <Stat label="Panels" value={panels} sub={`avg ${analytics.totalScenes > 0 ? Math.round(panels / analytics.totalScenes) : 0}/page`} />
        <Stat label="Dialogue balloons" value={balloons} sub="" />
        <Stat label="Captions" value={captions} sub="" />
      </div>
    )
  }

  if (cat === "interactive_fiction") {
    const choices = analytics.elementsByType["choice"] ?? 0
    const bodies = analytics.elementsByType["body"] ?? 0
    return (
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Passages" value={analytics.totalScenes} sub="" />
        <Stat label="Choice links" value={choices} sub={`avg ${analytics.totalScenes > 0 ? Math.round(choices / analytics.totalScenes) : 0}/passage`} />
        <Stat label="Words" value={analytics.totalWords.toLocaleString()} sub="" />
        <Stat label="Body blocks" value={bodies} sub="" />
      </div>
    )
  }

  if (cat === "ttrpg") {
    const tables = (analytics.elementsByType["table"] ?? 0) + (analytics.elementsByType["dice_table"] ?? 0)
    const callouts = analytics.elementsByType["callout"] ?? 0
    return (
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Sections" value={analytics.totalScenes} sub="" />
        <Stat label="Words" value={analytics.totalWords.toLocaleString()} sub={`avg ${analytics.avgWordsPerScene.toLocaleString()}/section`} />
        <Stat label="Tables" value={tables} sub={`${analytics.elementsByType["dice_table"] ?? 0} random tables`} />
        <Stat label="Designer notes" value={callouts} sub="" />
      </div>
    )
  }

  // fallback
  return (
    <div className="grid grid-cols-3 gap-4">
      <Stat label={s.unitLabelPlural} value={analytics.totalScenes} sub="" />
      <Stat label="Words" value={analytics.totalWords.toLocaleString()} sub="" />
      <Stat label="Avg words" value={analytics.avgWordsPerScene.toLocaleString()} sub="per section" />
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-bold text-foreground">{value}%</p>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

// ── Category-specific analysis cards ───────────────────────────────────────

interface AnalyticsCard {
  href: string
  title: string
  description: string
  icon: React.ElementType
  stat: string
  iconColor: string
  iconBg: string
  iconBorder: string
}

function getCards(analytics: ScriptAnalytics, projectId: string): AnalyticsCard[] {
  const cat = analytics.category
  const base = (path: string) => `${path}?project=${projectId}`

  if (cat === "screenplay") {
    return [
      { href: base("/analytics/overview"), title: "Analytics Overview", description: "Comprehensive analysis with key insights and recommendations", icon: BarChart3, stat: `${analytics.totalScenes} scenes · ${analytics.totalWords.toLocaleString()} words`, iconColor: "text-blue-500", iconBg: "bg-blue-500/10", iconBorder: "border-blue-500/30" },
      { href: base("/analytics/character-voice"), title: "Character Voice Profile", description: "Dialogue patterns, vocabulary complexity, and emotional range per character", icon: Users, stat: `${analytics.characters.length} characters`, iconColor: "text-purple-500", iconBg: "bg-purple-500/10", iconBorder: "border-purple-500/30" },
      { href: base("/analytics/pacing"), title: "Pacing Analysis", description: "Dramatic flow and narrative rhythm throughout your screenplay", icon: TrendingUp, stat: `${analytics.totalScenes} scenes mapped`, iconColor: "text-green-500", iconBg: "bg-green-500/10", iconBorder: "border-green-500/30" },
      { href: base("/analytics/conflict"), title: "Conflict Heatmap", description: "Scene-by-scene visualization of conflict and dialogue intensity", icon: Flame, stat: `${analytics.totalScenes} scenes`, iconColor: "text-orange-500", iconBg: "bg-orange-500/10", iconBorder: "border-orange-500/30" },
      { href: base("/analytics/dialogue"), title: "Dialogue Analysis", description: "Line distribution, vocabulary richness, and speaking patterns", icon: MessageSquare, stat: `${analytics.totalDialogueLines} dialogue lines`, iconColor: "text-cyan-500", iconBg: "bg-cyan-500/10", iconBorder: "border-cyan-500/30" },
      { href: base("/analytics/scene-breakdown"), title: "Scene Breakdown", description: "Scene-by-scene analysis with locations, characters, and structure", icon: FileText, stat: `${analytics.intScenes} INT · ${analytics.extScenes} EXT`, iconColor: "text-indigo-500", iconBg: "bg-indigo-500/10", iconBorder: "border-indigo-500/30" },
    ]
  }

  if (cat === "novel" || cat === "memoir") {
    return [
      { href: base("/analytics/overview"), title: "Overview", description: "Chapter lengths, word count distribution, and structure at a glance", icon: BarChart3, stat: `${analytics.totalScenes} chapters · ${analytics.totalWords.toLocaleString()} words`, iconColor: "text-blue-500", iconBg: "bg-blue-500/10", iconBorder: "border-blue-500/30" },
      { href: base("/analytics/pacing"), title: "Chapter Pacing", description: "Word count per chapter — visualise your narrative rhythm", icon: TrendingUp, stat: `avg ${analytics.avgWordsPerScene.toLocaleString()} words/chapter`, iconColor: "text-green-500", iconBg: "bg-green-500/10", iconBorder: "border-green-500/30" },
      { href: base("/analytics/dialogue"), title: "Dialogue & Prose Mix", description: "Balance between dialogue and narrative prose across the manuscript", icon: MessageSquare, stat: `${analytics.totalDialogueLines} dialogue lines`, iconColor: "text-cyan-500", iconBg: "bg-cyan-500/10", iconBorder: "border-cyan-500/30" },
    ]
  }

  if (cat === "poetry" || cat === "lyrics") {
    const lines = analytics.elementsByType["line"] ?? 0
    return [
      { href: base("/analytics/overview"), title: "Overview", description: "Line counts, stanza structure, and word density", icon: BarChart3, stat: `${analytics.totalScenes} ${cat === "lyrics" ? "songs" : "poems"} · ${lines} lines`, iconColor: "text-blue-500", iconBg: "bg-blue-500/10", iconBorder: "border-blue-500/30" },
      { href: base("/analytics/pacing"), title: "Length Comparison", description: "Compare lengths across poems or songs in this collection", icon: TrendingUp, stat: `${analytics.totalScenes} pieces`, iconColor: "text-green-500", iconBg: "bg-green-500/10", iconBorder: "border-green-500/30" },
    ]
  }

  if (cat === "comic") {
    const panels = analytics.elementsByType["panel"] ?? 0
    return [
      { href: base("/analytics/overview"), title: "Overview", description: "Page and panel counts, dialogue density", icon: BarChart3, stat: `${analytics.totalScenes} pages · ${panels} panels`, iconColor: "text-blue-500", iconBg: "bg-blue-500/10", iconBorder: "border-blue-500/30" },
      { href: base("/analytics/dialogue"), title: "Dialogue Breakdown", description: "Balloon and caption distribution across pages", icon: MessageSquare, stat: `${analytics.elementsByType["balloon"] ?? 0} balloons`, iconColor: "text-cyan-500", iconBg: "bg-cyan-500/10", iconBorder: "border-cyan-500/30" },
      { href: base("/analytics/pacing"), title: "Panel Pacing", description: "Panels-per-page rhythm through the issue", icon: Layers, stat: `avg ${analytics.totalScenes > 0 ? Math.round(panels / analytics.totalScenes) : 0} panels/page`, iconColor: "text-green-500", iconBg: "bg-green-500/10", iconBorder: "border-green-500/30" },
    ]
  }

  if (cat === "interactive_fiction") {
    const choices = analytics.elementsByType["choice"] ?? 0
    return [
      { href: base("/analytics/overview"), title: "Overview", description: "Passage count, link density, and word count", icon: BarChart3, stat: `${analytics.totalScenes} passages · ${choices} links`, iconColor: "text-blue-500", iconBg: "bg-blue-500/10", iconBorder: "border-blue-500/30" },
      { href: base("/analytics/pacing"), title: "Passage Length", description: "Word count distribution across all passages", icon: TrendingUp, stat: `avg ${analytics.avgWordsPerScene.toLocaleString()} words/passage`, iconColor: "text-green-500", iconBg: "bg-green-500/10", iconBorder: "border-green-500/30" },
      { href: base("/analytics/conflict"), title: "Branching Density", description: "Which passages have the most choices — key decision points", icon: GitBranch, stat: `${choices} total choices`, iconColor: "text-orange-500", iconBg: "bg-orange-500/10", iconBorder: "border-orange-500/30" },
    ]
  }

  if (cat === "ttrpg") {
    const tables = (analytics.elementsByType["table"] ?? 0) + (analytics.elementsByType["dice_table"] ?? 0)
    return [
      { href: base("/analytics/overview"), title: "Overview", description: "Section lengths, word count, and element distribution", icon: BarChart3, stat: `${analytics.totalScenes} sections · ${analytics.totalWords.toLocaleString()} words`, iconColor: "text-blue-500", iconBg: "bg-blue-500/10", iconBorder: "border-blue-500/30" },
      { href: base("/analytics/pacing"), title: "Section Length", description: "Word count per section — spot over/underwritten chapters", icon: TrendingUp, stat: `avg ${analytics.avgWordsPerScene.toLocaleString()} words/section`, iconColor: "text-green-500", iconBg: "bg-green-500/10", iconBorder: "border-green-500/30" },
      { href: base("/analytics/conflict"), title: "Table Density", description: "Distribution of random tables and structured content", icon: Dices, stat: `${tables} tables`, iconColor: "text-orange-500", iconBg: "bg-orange-500/10", iconBorder: "border-orange-500/30" },
    ]
  }

  return [
    { href: base("/analytics/overview"), title: "Overview", description: "Word count, section structure, and writing volume", icon: BarChart3, stat: `${analytics.totalScenes} sections · ${analytics.totalWords.toLocaleString()} words`, iconColor: "text-blue-500", iconBg: "bg-blue-500/10", iconBorder: "border-blue-500/30" },
    { href: base("/analytics/pacing"), title: "Pacing", description: "Section lengths over time", icon: TrendingUp, stat: `${analytics.totalScenes} sections`, iconColor: "text-green-500", iconBg: "bg-green-500/10", iconBorder: "border-green-500/30" },
  ]
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { projectId, analytics, isLoading } = useProjectAnalytics()
  const cat = analytics?.category ?? ""
  const categoryLabel = cat
    ? cat.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : ""

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/10">
      <main className="flex-1">
        <div className="border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/30">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {analytics?.projectTitle ?? (isLoading ? "Loading…" : "Project")}
                  </h2>
                  <p className="text-xs text-muted-foreground">{categoryLabel}</p>
                </div>
              </div>
              <Link href={`/projects/editor?id=${projectId}`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Editor
                </Button>
              </Link>
            </div>

            <div className="mb-6">
              <h1 className="mb-2 text-3xl font-bold text-foreground">Analytics</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Insights derived from your project data.
              </p>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-24 rounded-lg border border-border bg-card animate-pulse" />
                ))}
              </div>
            ) : analytics ? (
              <TopStats analytics={analytics} />
            ) : null}
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-8 py-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">Analysis Tools</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {analytics && getCards(analytics, projectId).map((card) => {
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
