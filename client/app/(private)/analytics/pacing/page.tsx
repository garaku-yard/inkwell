"use client"

import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import dynamic from "next/dynamic"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjectAnalytics } from "@/hooks/useProjectAnalytics"
import { FullPageSpinner } from "@/components/shared/FullPageSpinner"
import { PaneSpinner } from "@/components/shared/PaneSpinner"

// recharts is heavy; load it only when this page actually renders the chart.
const PacingChart = dynamic(() => import("@/components/analytics/pacing/PacingChart"), {
  ssr: false,
  loading: () => <div className="h-64"><PaneSpinner /></div>,
})

function PacingAnalysisContent() {
  const { projectId, analytics, isLoading, error } = useProjectAnalytics()

  if (isLoading) return <FullPageSpinner />

  if (error || !analytics) return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      {error ?? "No project data."}
    </div>
  )

  const avgWords = analytics.totalScenes > 0
    ? Math.round(analytics.totalWords / analytics.totalScenes)
    : 0

  const sceneRows = analytics.scenes.map(s => ({
    scene: `Scene ${s.index}`,
    words: s.wordCount,
    dialogueLines: s.dialogueLines,
    characters: s.characters.length,
    type: s.dialogueLines > s.elementCount / 2 ? "Dialogue-heavy" : "Action-heavy",
  }))

  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/analytics?project=${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
              ← Analytics
            </Link>
            <h1 className="text-xl font-semibold text-foreground">Pacing Analysis</h1>
          </div>
          <Link href={`/projects/editor?id=${projectId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Editor
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Scenes</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.totalScenes}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">In this project</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Avg Words / Scene</CardDescription>
              <CardTitle className="text-3xl font-bold">{avgWords}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Higher = slower pacing</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Words</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.totalWords.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Across all scenes</p>
            </CardContent>
          </Card>
        </div>

        {/* Word count area chart */}
        <Card>
          <CardHeader>
            <CardTitle>Scene Word Count</CardTitle>
            <CardDescription>
              Word density per scene — a proxy for scene length and pacing weight
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.pacingData.length > 0 ? (
              <PacingChart data={analytics.pacingData} />
            ) : (
              <p className="text-sm text-muted-foreground">No scene data.</p>
            )}
          </CardContent>
        </Card>

        {/* Scene table */}
        <Card>
          <CardHeader>
            <CardTitle>Scene Details</CardTitle>
            <CardDescription>Word count and dialogue breakdown per scene</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sceneRows.map((row, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="font-medium w-24 shrink-0">{row.scene}</span>
                  <span className="text-muted-foreground w-28">{row.words} words</span>
                  <span className="text-muted-foreground w-28">{row.dialogueLines} dialogue</span>
                  <Badge variant="outline" className="text-xs">{row.type}</Badge>
                </div>
              ))}
              {sceneRows.length === 0 && (
                <p className="text-sm text-muted-foreground">No scenes found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default function PacingAnalysis() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <PacingAnalysisContent />
    </Suspense>
  )
}
