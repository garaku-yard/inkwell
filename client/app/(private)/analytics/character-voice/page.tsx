"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjectAnalytics } from "@/hooks/useProjectAnalytics"

export default function CharacterVoiceAnalysis() {
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

  const maxWords = Math.max(...analytics.characters.map(c => c.words), 1)
  const maxDistinct = Math.max(...analytics.characters.map(c => c.distinctWords), 1)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/analytics?project=${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
              ← Analytics
            </Link>
            <h1 className="text-xl font-semibold text-foreground">Character Voice Analysis</h1>
          </div>
          <Link href={`/projects/${projectId}/editor`}>
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
              <CardDescription>Speaking Characters</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.characters.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">With at least one dialogue line</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Dialogue Lines</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.totalDialogueLines}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Across all characters</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Most Verbose</CardDescription>
              <CardTitle className="text-3xl font-bold truncate">
                {analytics.characters.sort((a, b) => b.wordsPerLine - a.wordsPerLine)[0]?.name ?? "—"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {analytics.characters.sort((a, b) => b.wordsPerLine - a.wordsPerLine)[0]
                  ? `${analytics.characters.sort((a, b) => b.wordsPerLine - a.wordsPerLine)[0].wordsPerLine} words/line`
                  : ""}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="vocabulary" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="vocabulary">Vocabulary</TabsTrigger>
            <TabsTrigger value="verbosity">Verbosity</TabsTrigger>
          </TabsList>

          <TabsContent value="vocabulary" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Vocabulary Richness</CardTitle>
                <CardDescription>Unique words used per character — higher = more varied vocabulary</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {analytics.characters.map(c => (
                  <div key={c.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-sm text-muted-foreground">{c.distinctWords} unique words</span>
                    </div>
                    <Progress value={(c.distinctWords / maxDistinct) * 100} className="h-2" />
                  </div>
                ))}
                {analytics.characters.length === 0 && (
                  <p className="text-sm text-muted-foreground">No dialogue data.</p>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {analytics.characters.slice(0, 6).map(c => (
                <Card key={c.name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <CardDescription>{c.lines} lines · {c.words} words</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Unique words</span>
                      <span className="font-medium">{c.distinctWords}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Words / line</span>
                      <span className="font-medium">{c.wordsPerLine}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Dialogue share</span>
                      <Badge variant="secondary" className="text-xs">{c.percentage}%</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="verbosity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Words per Line</CardTitle>
                <CardDescription>Average words spoken per dialogue line — higher = longer speeches</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[...analytics.characters].sort((a, b) => b.wordsPerLine - a.wordsPerLine).map(c => (
                  <div key={c.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-sm text-muted-foreground">{c.wordsPerLine} words/line</span>
                    </div>
                    <Progress
                      value={(c.wordsPerLine / Math.max(...analytics.characters.map(x => x.wordsPerLine), 1)) * 100}
                      className="h-2"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total Words Spoken</CardTitle>
                <CardDescription>Cumulative word count per character</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[...analytics.characters].sort((a, b) => b.words - a.words).map(c => (
                  <div key={c.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-sm text-muted-foreground">{c.words.toLocaleString()} words</span>
                    </div>
                    <Progress value={(c.words / maxWords) * 100} className="h-2" />
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
