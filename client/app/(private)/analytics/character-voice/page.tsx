"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSearchParams } from 'next/navigation'

const vocabularyData = [
  { character: "JANE", unique: 245, total: 680 },
  { character: "MARK", unique: 198, total: 520 },
  { character: "SARAH", unique: 156, total: 380 },
]

const sentenceComplexity = [
  { character: "JANE", simple: 45, compound: 35, complex: 20 },
  { character: "MARK", simple: 60, compound: 25, complex: 15 },
  { character: "SARAH", simple: 50, compound: 30, complex: 20 },
]

const emotionalTone = [
  { name: "Professional", value: 45, color: "oklch(0.62 0.24 264)" },
  { name: "Confident", value: 30, color: "oklch(0.58 0.19 210)" },
  { name: "Urgent", value: 15, color: "oklch(0.68 0.15 85)" },
  { name: "Casual", value: 10, color: "oklch(0.55 0.18 142)" },
]

export default function CharacterVoiceAnalysis() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project') || '272b597d-63c1-4b29-9150-c0cefd009987'

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

      <main className="mx-auto max-w-7xl p-6">
        <Tabs defaultValue="jane" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="jane">JANE</TabsTrigger>
            <TabsTrigger value="mark">MARK</TabsTrigger>
            <TabsTrigger value="sarah">SARAH</TabsTrigger>
          </TabsList>

          <TabsContent value="jane" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Vocabulary Range</CardTitle>
                  <CardDescription>Unique words vs total words spoken</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">245 unique</div>
                  <p className="text-xs text-muted-foreground">out of 680 total words</p>
                  <Progress value={36} className="mt-3" />
                  <p className="text-xs text-muted-foreground mt-1">36% vocabulary diversity</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sentence Structure</CardTitle>
                  <CardDescription>Complexity of dialogue patterns</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Simple</span>
                    <span className="text-sm font-medium">45%</span>
                  </div>
                  <Progress value={45} className="h-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Compound</span>
                    <span className="text-sm font-medium">35%</span>
                  </div>
                  <Progress value={35} className="h-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Complex</span>
                    <span className="text-sm font-medium">20%</span>
                  </div>
                  <Progress value={20} className="h-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Emotional Tone</CardTitle>
                  <CardDescription>Distribution of emotional markers</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      professional: { label: "Professional", color: "oklch(0.62 0.24 264)" },
                      confident: { label: "Confident", color: "oklch(0.58 0.19 210)" },
                      urgent: { label: "Urgent", color: "oklch(0.68 0.15 85)" },
                      casual: { label: "Casual", color: "oklch(0.55 0.18 142)" },
                    }}
                    className="h-[200px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={emotionalTone}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          dataKey="value"
                        >
                          {emotionalTone.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Speech Patterns</CardTitle>
                  <CardDescription>Characteristic phrases and word choices</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Most Frequent Phrases</h4>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">"I think we should"</Badge>
                        <Badge variant="secondary">"according to"</Badge>
                        <Badge variant="secondary">"let me check"</Badge>
                        <Badge variant="secondary">"that makes sense"</Badge>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-2">Unique Vocabulary</h4>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">methodology</Badge>
                        <Badge variant="outline">protocol</Badge>
                        <Badge variant="outline">parameters</Badge>
                        <Badge variant="outline">optimization</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Voice Consistency</CardTitle>
                  <CardDescription>How consistent this character's voice remains</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Vocabulary Consistency</span>
                        <span className="text-sm font-medium">92%</span>
                      </div>
                      <Progress value={92} className="h-2" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Tone Stability</span>
                        <span className="text-sm font-medium">87%</span>
                      </div>
                      <Progress value={87} className="h-2" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Speech Pattern</span>
                        <span className="text-sm font-medium">94%</span>
                      </div>
                      <Progress value={94} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="mark" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Vocabulary Range</CardTitle>
                  <CardDescription>Unique words vs total words spoken</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">198 unique</div>
                  <p className="text-xs text-muted-foreground">out of 520 total words</p>
                  <Progress value={38} className="mt-3" />
                  <p className="text-xs text-muted-foreground mt-1">38% vocabulary diversity</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sentence Structure</CardTitle>
                  <CardDescription>Complexity of dialogue patterns</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Simple</span>
                    <span className="text-sm font-medium">60%</span>
                  </div>
                  <Progress value={60} className="h-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Compound</span>
                    <span className="text-sm font-medium">25%</span>
                  </div>
                  <Progress value={25} className="h-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Complex</span>
                    <span className="text-sm font-medium">15%</span>
                  </div>
                  <Progress value={15} className="h-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Character Traits</CardTitle>
                  <CardDescription>Mark's distinctive characteristics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Badge className="bg-blue-100 text-blue-800">Direct Communicator</Badge>
                    <Badge className="bg-green-100 text-green-800">Action-Oriented</Badge>
                    <Badge className="bg-orange-100 text-orange-800">Informal Speech</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sarah" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Vocabulary Range</CardTitle>
                  <CardDescription>Unique words vs total words spoken</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">156 unique</div>
                  <p className="text-xs text-muted-foreground">out of 380 total words</p>
                  <Progress value={41} className="mt-3" />
                  <p className="text-xs text-muted-foreground mt-1">41% vocabulary diversity</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sentence Structure</CardTitle>
                  <CardDescription>Complexity of dialogue patterns</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Simple</span>
                    <span className="text-sm font-medium">50%</span>
                  </div>
                  <Progress value={50} className="h-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Compound</span>
                    <span className="text-sm font-medium">30%</span>
                  </div>
                  <Progress value={30} className="h-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Complex</span>
                    <span className="text-sm font-medium">20%</span>
                  </div>
                  <Progress value={20} className="h-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Character Traits</CardTitle>
                  <CardDescription>Sarah's distinctive characteristics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Badge className="bg-purple-100 text-purple-800">Thoughtful</Badge>
                    <Badge className="bg-pink-100 text-pink-800">Empathetic</Badge>
                    <Badge className="bg-indigo-100 text-indigo-800">Diplomatic</Badge>
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
