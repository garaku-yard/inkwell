"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ArrowLeft, MessageCircle, Volume2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useSearchParams } from 'next/navigation'

export default function DialogueAnalysis() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project') || '272b597d-63c1-4b29-9150-c0cefd009987'

  const characters = [
    {
      name: "Sarah",
      lines: 45,
      wordsPerLine: 12.3,
      distinctWords: 234,
      readabilityScore: 8.2,
      emotionalRange: 7.5,
      speechPatterns: ["Analytical", "Precise", "Empathetic"]
    },
    {
      name: "Marcus",
      lines: 38,
      wordsPerLine: 15.7,
      distinctWords: 189,
      readabilityScore: 6.8,
      emotionalRange: 6.2,
      speechPatterns: ["Direct", "Authoritative", "Pragmatic"]
    },
    {
      name: "Elena",
      lines: 42,
      wordsPerLine: 10.8,
      distinctWords: 267,
      readabilityScore: 9.1,
      emotionalRange: 8.8,
      speechPatterns: ["Poetic", "Emotional", "Intuitive"]
    },
  ]

  const dialogueMetrics = {
    averageLineLength: 12.9,
    totalLines: 125,
    readabilityScore: 8.0,
    characterBalance: 85,
    naturalness: 7.8
  }

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
        {/* Overview Stats */}
        <div className="grid gap-6 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Lines</CardDescription>
              <CardTitle className="text-3xl font-bold">{dialogueMetrics.totalLines}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Across all characters</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Avg Line Length</CardDescription>
              <CardTitle className="text-3xl font-bold">{dialogueMetrics.averageLineLength}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Words per line</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Readability</CardDescription>
              <CardTitle className="text-3xl font-bold">{dialogueMetrics.readabilityScore}/10</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Easy to understand</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Character Balance</CardDescription>
              <CardTitle className="text-3xl font-bold">{dialogueMetrics.characterBalance}%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Well distributed</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Analysis */}
        <Tabs defaultValue="characters" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="characters">Character Voices</TabsTrigger>
            <TabsTrigger value="metrics">Dialogue Metrics</TabsTrigger>
            <TabsTrigger value="patterns">Speech Patterns</TabsTrigger>
            <TabsTrigger value="quality">Quality Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="characters" className="space-y-4">
            <div className="grid gap-6">
              {characters.map((character, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <MessageCircle className="h-5 w-5" />
                        {character.name}
                      </CardTitle>
                      <Badge variant="outline">{character.lines} lines</Badge>
                    </div>
                    <CardDescription>
                      Character voice analysis and speaking patterns
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Vocabulary Richness</span>
                            <span className="text-sm font-medium">{character.distinctWords} words</span>
                          </div>
                          <Progress value={(character.distinctWords / 300) * 100} className="h-2" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Readability Score</span>
                            <span className="text-sm font-medium">{character.readabilityScore}/10</span>
                          </div>
                          <Progress value={character.readabilityScore * 10} className="h-2" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Emotional Range</span>
                            <span className="text-sm font-medium">{character.emotionalRange}/10</span>
                          </div>
                          <Progress value={character.emotionalRange * 10} className="h-2" />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <span className="text-sm font-medium">Words per Line</span>
                          <p className="text-2xl font-bold">{character.wordsPerLine}</p>
                        </div>

                        <div>
                          <span className="text-sm font-medium">Speech Patterns</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {character.speechPatterns.map((pattern, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {pattern}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="metrics" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Line Distribution</CardTitle>
                  <CardDescription>
                    How dialogue is distributed among characters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {characters.map((character, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{character.name}</span>
                        <span className="text-sm font-medium">{character.lines} lines ({Math.round((character.lines / dialogueMetrics.totalLines) * 100)}%)</span>
                      </div>
                      <Progress value={(character.lines / dialogueMetrics.totalLines) * 100} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dialogue Quality Metrics</CardTitle>
                  <CardDescription>
                    Overall quality indicators for your dialogue
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Naturalness</span>
                      <span className="text-sm font-medium">{dialogueMetrics.naturalness}/10</span>
                    </div>
                    <Progress value={dialogueMetrics.naturalness * 10} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Character Distinction</span>
                      <span className="text-sm font-medium">8.5/10</span>
                    </div>
                    <Progress value={85} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Plot Advancement</span>
                      <span className="text-sm font-medium">7.2/10</span>
                    </div>
                    <Progress value={72} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Subtext Quality</span>
                      <span className="text-sm font-medium">6.8/10</span>
                    </div>
                    <Progress value={68} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="patterns" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Speech Pattern Analysis</CardTitle>
                <CardDescription>
                  Recurring patterns and linguistic characteristics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-3">
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Volume2 className="h-4 w-4" />
                      Common Phrases
                    </h4>
                    <div className="space-y-2">
                      <Badge variant="outline">"I think that..."</Badge>
                      <Badge variant="outline">"Wait, what if..."</Badge>
                      <Badge variant="outline">"Listen to me"</Badge>
                      <Badge variant="outline">"You don't understand"</Badge>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Interruption Patterns
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div>Sarah interrupts: 12 times</div>
                      <div>Marcus interrupts: 8 times</div>
                      <div>Elena interrupts: 15 times</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3">Question Frequency</h4>
                    <div className="space-y-2 text-sm">
                      <div>Rhetorical questions: 23</div>
                      <div>Direct questions: 31</div>
                      <div>Leading questions: 12</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quality" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Strengths</CardTitle>
                  <CardDescription>
                    What's working well in your dialogue
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-semibold text-sm text-green-700">Distinct Character Voices</h4>
                    <p className="text-sm text-muted-foreground">
                      Each character has a unique speaking style and vocabulary.
                    </p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-semibold text-sm text-green-700">Natural Flow</h4>
                    <p className="text-sm text-muted-foreground">
                      Conversations feel organic with realistic interruptions and responses.
                    </p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-semibold text-sm text-green-700">Emotional Depth</h4>
                    <p className="text-sm text-muted-foreground">
                      Characters express complex emotions through their dialogue.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Areas for Improvement</CardTitle>
                  <CardDescription>
                    Suggestions to enhance your dialogue
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-l-4 border-orange-500 pl-4">
                    <h4 className="font-semibold text-sm text-orange-700">Reduce Exposition</h4>
                    <p className="text-sm text-muted-foreground">
                      Some lines feel heavy with exposition. Try weaving information more naturally.
                    </p>
                  </div>

                  <div className="border-l-4 border-blue-500 pl-4">
                    <h4 className="font-semibold text-sm text-blue-700">Strengthen Subtext</h4>
                    <p className="text-sm text-muted-foreground">
                      Add more layers of meaning beneath the surface dialogue.
                    </p>
                  </div>

                  <div className="border-l-4 border-yellow-500 pl-4">
                    <h4 className="font-semibold text-sm text-yellow-700">Vary Sentence Structure</h4>
                    <p className="text-sm text-muted-foreground">
                      Mix short and long sentences for better rhythm and pacing.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
