"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSearchParams } from 'next/navigation'

const pacingData = [
  { page: 0, tension: 35, name: "Opening" },
  { page: 5, tension: 45, name: "" },
  { page: 10, tension: 60, name: "Scene 1" },
  { page: 15, tension: 55, name: "" },
  { page: 20, tension: 40, name: "" },
  { page: 25, tension: 65, name: "Scene 2" },
  { page: 30, tension: 75, name: "" },
  { page: 35, tension: 85, name: "Peak" },
  { page: 40, tension: 90, name: "Climax" },
  { page: 42, tension: 30, name: "Resolution" },
]

const sceneBreakdown = [
  { scene: "Scene 1", tension: 60, pacing: "Medium", pages: 8, type: "Setup" },
  { scene: "Scene 2", tension: 65, pacing: "Fast", pages: 6, type: "Rising Action" },
  { scene: "Scene 3", tension: 85, pacing: "Fast", pages: 4, type: "Conflict" },
  { scene: "Scene 4", tension: 90, pacing: "Very Fast", pages: 3, type: "Climax" },
  { scene: "Scene 5", tension: 30, pacing: "Slow", pages: 2, type: "Resolution" },
]

export default function PacingAnalysis() {
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
            <h1 className="text-xl font-semibold text-foreground">Pacing & Tension Analysis</h1>
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
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardDescription className="text-muted-foreground">Average Tension</CardDescription>
              <CardTitle className="text-3xl font-bold text-foreground">62%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Well-balanced tension curve</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardDescription className="text-muted-foreground">Peak Tension</CardDescription>
              <CardTitle className="text-3xl font-bold text-foreground">90%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Occurs at page 40 (climax)</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardDescription className="text-muted-foreground">Pacing Score</CardDescription>
              <CardTitle className="text-3xl font-bold text-foreground">87/100</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Excellent flow and rhythm</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardDescription className="text-muted-foreground">Scene Changes</CardDescription>
              <CardTitle className="text-3xl font-bold text-foreground">23</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Good variety and movement</p>
            </CardContent>
          </Card>
        </div>

        {/* Tension Curve Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Tension Curve Analysis</CardTitle>
            <CardDescription>
              Visual representation of dramatic tension throughout your screenplay
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                tension: {
                  label: "Tension Level",
                  color: "oklch(0.68 0.15 85)",
                },
              }}
              className="h-[400px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pacingData}>
                  <defs>
                    <linearGradient id="tensionGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.68 0.15 85)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="oklch(0.68 0.15 85)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.78 0.01 85)" />
                  <XAxis
                    dataKey="page"
                    stroke="oklch(0.55 0.18 142)"
                    label={{ value: 'Page Number', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis
                    stroke="oklch(0.55 0.18 142)"
                    label={{ value: 'Tension Level', angle: -90, position: 'insideLeft' }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="tension"
                    stroke="oklch(0.68 0.15 85)"
                    fillOpacity={1}
                    fill="url(#tensionGradient)"
                    strokeWidth={2}
                  />
                  <ReferenceLine y={70} stroke="red" strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Scene Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Scene-by-Scene Breakdown</CardTitle>
            <CardDescription>
              Detailed analysis of tension and pacing for each scene
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sceneBreakdown.map((scene, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{scene.scene}</h4>
                      <Badge variant={scene.type === 'Climax' ? 'destructive' : 'secondary'}>
                        {scene.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{scene.pages} pages</p>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Tension:</span>
                      <Badge variant={scene.tension >= 80 ? 'destructive' : scene.tension >= 60 ? 'default' : 'secondary'}>
                        {scene.tension}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Pacing:</span>
                      <Badge variant="outline">{scene.pacing}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle>AI Recommendations</CardTitle>
            <CardDescription>
              Suggestions to optimize your screenplay's pacing and tension
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-l-4 border-green-500 pl-4">
              <h4 className="font-semibold text-sm text-green-700">Excellent Climax Placement</h4>
              <p className="text-sm text-muted-foreground">
                Your climax occurs at the optimal point (page 40), creating maximum dramatic impact.
              </p>
            </div>
            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="font-semibold text-sm text-blue-700">Strong Tension Curve</h4>
              <p className="text-sm text-muted-foreground">
                The tension builds effectively throughout Act II, maintaining audience engagement.
              </p>
            </div>
            <div className="border-l-4 border-orange-500 pl-4">
              <h4 className="font-semibold text-sm text-orange-700">Consider Subplot Integration</h4>
              <p className="text-sm text-muted-foreground">
                Pages 15-20 show slight tension dip. Consider weaving in subplot complications to maintain momentum.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
