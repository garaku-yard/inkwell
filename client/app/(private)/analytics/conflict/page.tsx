"use client"

import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjectAnalytics } from "@/hooks/useProjectAnalytics"
import { FullPageSpinner } from "@/components/shared/FullPageSpinner"

function intensityColor(v: number) {
  if (v >= 75) return "bg-red-500"
  if (v >= 50) return "bg-orange-500"
  if (v >= 25) return "bg-yellow-500"
  return "bg-green-500"
}

function intensityLabel(v: number) {
  if (v >= 75) return "Peak"
  if (v >= 50) return "High"
  if (v >= 25) return "Medium"
  return "Low"
}

function ConflictHeatmapContent() {
  const { projectId, analytics, isLoading, error } = useProjectAnalytics()

  if (isLoading) return <FullPageSpinner />

  if (error || !analytics) return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      {error ?? "No project data."}
    </div>
  )

  const peakScene = [...analytics.conflictData].sort((a, b) => b.intensity - a.intensity)[0]

  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/analytics?project=${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
              ← Analytics
            </Link>
            <h1 className="text-xl font-semibold text-foreground">Conflict Heatmap</h1>
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
              <CardDescription>Scenes Mapped</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.totalScenes}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Dialogue density used as conflict proxy</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Peak Scene</CardDescription>
              <CardTitle className="text-3xl font-bold">
                {peakScene ? `Scene ${peakScene.scene}` : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {peakScene ? peakScene.name : "No data"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Dialogue Ratio</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.dialogueRatio}%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Overall dialogue vs. action</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Scene Dialogue Intensity</CardTitle>
            <CardDescription>
              Dialogue density per scene as a proxy for dramatic intensity — higher dialogue = more confrontation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span>Intensity:</span>
              {[["bg-green-500", "Low"], ["bg-yellow-500", "Medium"], ["bg-orange-500", "High"], ["bg-red-500", "Peak"]].map(([cls, label]) => (
                <span key={label} className="flex items-center gap-1">
                  <span className={`inline-block w-3 h-3 rounded ${cls}`} />
                  {label}
                </span>
              ))}
            </div>
            <div className="space-y-3">
              {analytics.conflictData.map(d => (
                <div key={d.scene} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium w-20 shrink-0">Scene {d.scene}</span>
                    <span className="text-muted-foreground truncate flex-1 mx-4">{d.name}</span>
                    <Badge variant="outline" className="shrink-0">{intensityLabel(d.intensity)}</Badge>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${intensityColor(d.intensity)}`}
                      style={{ width: `${Math.max(d.intensity, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
              {analytics.conflictData.length === 0 && (
                <p className="text-sm text-muted-foreground">No scene data.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Visual heatmap grid */}
        {analytics.conflictData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Heatmap Grid</CardTitle>
              <CardDescription>Each block represents one scene — color = dialogue intensity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {analytics.conflictData.map(d => (
                  <div
                    key={d.scene}
                    title={`Scene ${d.scene}: ${d.name} (${d.intensity}%)`}
                    className={`w-10 h-10 rounded flex items-center justify-center text-xs font-bold text-white ${intensityColor(d.intensity)}`}
                  >
                    {d.scene}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}

export default function ConflictHeatmap() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ConflictHeatmapContent />
    </Suspense>
  )
}
