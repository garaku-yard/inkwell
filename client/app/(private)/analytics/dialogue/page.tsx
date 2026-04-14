"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ArrowLeft, Loader2, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useProjectAnalytics } from "@/hooks/useProjectAnalytics"

export default function DialogueAnalysis() {
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

  const maxDistinct = Math.max(...analytics.characters.map(c => c.distinctWords), 1)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/analytics?project=${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
              ← Analytics
            </Link>
            <h1 className="text-xl font-semibold text-foreground">Dialogue Analysis</h1>
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
        <div className="grid gap-6 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Lines</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.totalDialogueLines}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Across all characters</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Characters</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.characters.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">With dialogue</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Dialogue Ratio</CardDescription>
              <CardTitle className="text-3xl font-bold">{analytics.dialogueRatio}%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Of speech/action lines</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Top Character</CardDescription>
              <CardTitle className="text-3xl font-bold truncate">
                {analytics.characters[0]?.name ?? "—"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {analytics.characters[0] ? `${analytics.characters[0].lines} lines (${analytics.characters[0].percentage}%)` : "No dialogue"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="characters" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="characters">Character Voices</TabsTrigger>
            <TabsTrigger value="distribution">Line Distribution</TabsTrigger>
          </TabsList>

          <TabsContent value="characters" className="space-y-4">
            {analytics.characters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No character dialogue found.</p>
            ) : (
              analytics.characters.map(character => (
                <Card key={character.name}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <MessageCircle className="h-5 w-5" />
                        {character.name}
                      </CardTitle>
                      <Badge variant="outline">{character.lines} lines</Badge>
                    </div>
                    <CardDescription>
                      {character.words} total words · {character.wordsPerLine} words/line
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Vocabulary Richness</span>
                            <span className="text-sm font-medium">{character.distinctWords} unique words</span>
                          </div>
                          <Progress value={(character.distinctWords / maxDistinct) * 100} className="h-2" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Share of Dialogue</span>
                            <span className="text-sm font-medium">{character.percentage}%</span>
                          </div>
                          <Progress value={character.percentage} className="h-2" />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <span className="text-sm font-medium">Words per Line</span>
                          <p className="text-2xl font-bold">{character.wordsPerLine}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Total Words</span>
                          <p className="text-2xl font-bold">{character.words.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="distribution" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Line Distribution</CardTitle>
                <CardDescription>How dialogue is spread among characters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {analytics.characters.map(character => (
                  <div key={character.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{character.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {character.lines} lines ({character.percentage}%)
                      </span>
                    </div>
                    <Progress value={character.percentage} className="h-2" />
                  </div>
                ))}
                {analytics.characters.length === 0 && (
                  <p className="text-sm text-muted-foreground">No dialogue data.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
