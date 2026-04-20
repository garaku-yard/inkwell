"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjectAnalytics } from "@/hooks/useProjectAnalytics"

export default function AnalyticsOverview() {
  const { projectId, analytics, isLoading, error } = useProjectAnalytics()

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )

  if (error || !analytics) return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      {error ?? "No project data. Open analytics from a project."}
    </div>
  )

  const top4Characters = analytics.characters.slice(0, 4)
  const othersPercentage = analytics.characters.slice(4).reduce((sum, c) => sum + c.percentage, 0)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/analytics?project=${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
              ← Analytics
            </Link>
            <h1 className="text-xl font-semibold text-foreground">Analytics Overview</h1>
          </div>
          <Link href={`/projects/editor?id=${projectId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Editor
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6">
        {/* Quick Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Scenes</CardDescription>
              <CardTitle className="text-2xl">{analytics.totalScenes}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{analytics.intScenes} interior · {analytics.extScenes} exterior</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Characters</CardDescription>
              <CardTitle className="text-2xl">{analytics.characters.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{analytics.totalDialogueLines} total dialogue lines</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Dialogue Ratio</CardDescription>
              <CardTitle className="text-2xl">{analytics.dialogueRatio}%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Dialogue vs. action lines</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Words</CardDescription>
              <CardTitle className="text-2xl">{analytics.totalWords.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{analytics.totalActionWords.toLocaleString()} in action lines</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Character distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Character Dialogue Distribution</CardTitle>
              <CardDescription>Lines of dialogue per character</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {top4Characters.map(c => (
                <div key={c.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-sm text-muted-foreground">{c.lines} lines ({c.percentage}%)</span>
                  </div>
                  <Progress value={c.percentage} className="h-2" />
                </div>
              ))}
              {othersPercentage > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Others</span>
                    <span className="text-sm text-muted-foreground">{othersPercentage}%</span>
                  </div>
                  <Progress value={othersPercentage} className="h-2" />
                </div>
              )}
              {analytics.characters.length === 0 && (
                <p className="text-sm text-muted-foreground">No character dialogue found.</p>
              )}
            </CardContent>
          </Card>

          {/* Scene breakdown INT/EXT */}
          <Card>
            <CardHeader>
              <CardTitle>Scene Breakdown</CardTitle>
              <CardDescription>Interior vs exterior scenes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {analytics.totalScenes > 0 ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Interior (INT)</span>
                      <span className="text-sm text-muted-foreground">{analytics.intScenes} scenes</span>
                    </div>
                    <Progress value={(analytics.intScenes / analytics.totalScenes) * 100} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Exterior (EXT)</span>
                      <span className="text-sm text-muted-foreground">{analytics.extScenes} scenes</span>
                    </div>
                    <Progress value={(analytics.extScenes / analytics.totalScenes) * 100} className="h-2" />
                  </div>
                  {analytics.totalScenes - analytics.intScenes - analytics.extScenes > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Other / Untagged</span>
                        <span className="text-sm text-muted-foreground">
                          {analytics.totalScenes - analytics.intScenes - analytics.extScenes} scenes
                        </span>
                      </div>
                      <Progress
                        value={((analytics.totalScenes - analytics.intScenes - analytics.extScenes) / analytics.totalScenes) * 100}
                        className="h-2"
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No scenes found.</p>
              )}
            </CardContent>
          </Card>

          {/* Pacing (word count per scene) */}
          <Card>
            <CardHeader>
              <CardTitle>Pacing Overview</CardTitle>
              <CardDescription>Relative word density per scene — heavier bars = longer scenes</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.pacingData.length > 0 ? (
                <div className="h-32 flex items-end gap-px">
                  {analytics.pacingData.map((d) => (
                    <div
                      key={d.scene}
                      title={`Scene ${d.scene}: ${d.name}`}
                      className="bg-primary/30 hover:bg-primary/60 flex-1 rounded-sm transition-colors"
                      style={{ height: `${Math.max(d.words, 4)}%` }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No scene data.</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {analytics.totalScenes} scenes · avg {analytics.totalScenes > 0 ? Math.round(analytics.totalWords / analytics.totalScenes) : 0} words/scene
              </p>
            </CardContent>
          </Card>

          {/* Dialogue stats */}
          <Card>
            <CardHeader>
              <CardTitle>Dialogue Stats</CardTitle>
              <CardDescription>Across all characters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Dialogue lines</span>
                  <span className="text-sm text-muted-foreground">{analytics.totalDialogueLines}</span>
                </div>
                <Progress value={analytics.dialogueRatio} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Unique characters</span>
                  <span className="text-sm text-muted-foreground">{analytics.characters.length}</span>
                </div>
                <Progress
                  value={Math.min(analytics.characters.length * 10, 100)}
                  className="h-2"
                />
              </div>
              {analytics.characters[0] && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Avg words/line ({analytics.characters[0].name})</span>
                    <span className="text-sm text-muted-foreground">{analytics.characters[0].wordsPerLine}</span>
                  </div>
                  <Progress value={Math.min(analytics.characters[0].wordsPerLine * 5, 100)} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
