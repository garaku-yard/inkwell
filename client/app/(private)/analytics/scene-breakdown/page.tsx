"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ArrowLeft, Loader2, MapPin, Clock, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useProjectAnalytics } from "@/hooks/useProjectAnalytics"

export default function SceneBreakdown() {
  const { projectId, analytics, isLoading, error } = useProjectAnalytics()

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )

  if (error || !analytics) return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      {error ?? "No project data."}
    </div>
  )

  const maxWords = Math.max(...analytics.scenes.map(s => s.wordCount), 1)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/analytics?project=${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
              ← Analytics
            </Link>
            <h1 className="text-xl font-semibold text-foreground">Scene Breakdown</h1>
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
        <div className="grid gap-6 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Scenes</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.totalScenes}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{analytics.totalWords.toLocaleString()} total words</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Avg Scene Length</CardDescription>
              <CardTitle className="text-3xl font-bold">
                {analytics.totalScenes > 0 ? Math.round(analytics.totalWords / analytics.totalScenes) : 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Words per scene</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Interior</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.intScenes}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">INT scenes</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Exterior</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.extScenes}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">EXT scenes</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Scene List</TabsTrigger>
            <TabsTrigger value="structure">Length Distribution</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {analytics.scenes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scenes found in this project.</p>
            ) : (
              analytics.scenes.map(scene => (
                <Card key={scene.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">
                          Scene {scene.index}: {scene.heading || "(untitled)"}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {scene.wordCount} words · {scene.dialogueLines} dialogue lines
                        </CardDescription>
                      </div>
                      {scene.intOrExt && <Badge variant="outline">{scene.intOrExt}</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {scene.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {scene.location}
                        </span>
                      )}
                      {scene.timeOfDay && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {scene.timeOfDay}
                        </span>
                      )}
                      {scene.characters.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {scene.characters.join(", ")}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="structure" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Scene Word Count Distribution</CardTitle>
                <CardDescription>Relative length of each scene</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analytics.scenes.map(scene => (
                  <div key={scene.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-xs">{scene.index}. {scene.location || scene.heading}</span>
                      <span className="text-muted-foreground ml-4 shrink-0">{scene.wordCount} words</span>
                    </div>
                    <Progress value={(scene.wordCount / maxWords) * 100} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
