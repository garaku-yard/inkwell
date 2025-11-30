"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { ChevronRight, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSearchParams } from 'next/navigation'

export default function AnalyticsOverview() {
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
            <h1 className="text-xl font-semibold text-foreground">Analytics Overview</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/projects/${projectId}/editor`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Editor
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6">
        {/* Quick Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Pages</CardDescription>
              <CardTitle className="text-2xl">42</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Industry standard: 90-120</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Character Count</CardDescription>
              <CardTitle className="text-2xl">8</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Major: 3, Minor: 5</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Dialogue Ratio</CardDescription>
              <CardTitle className="text-2xl">67%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Dialogue vs. Action</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pacing Score</CardDescription>
              <CardTitle className="text-2xl">87/100</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Well-paced</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Analytics Sections */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Character Distribution</CardTitle>
              <CardDescription>
                Lines of dialogue per character across your screenplay
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Sarah Chen</span>
                  <span className="text-sm text-muted-foreground">32%</span>
                </div>
                <Progress value={32} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Marcus Rivera</span>
                  <span className="text-sm text-muted-foreground">28%</span>
                </div>
                <Progress value={28} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Dr. Elizabeth Hayes</span>
                  <span className="text-sm text-muted-foreground">21%</span>
                </div>
                <Progress value={21} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Others</span>
                  <span className="text-sm text-muted-foreground">19%</span>
                </div>
                <Progress value={19} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scene Breakdown</CardTitle>
              <CardDescription>
                Analysis of your scenes by type and location
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Interior Scenes</span>
                  <span className="text-sm text-muted-foreground">18 scenes</span>
                </div>
                <Progress value={72} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Exterior Scenes</span>
                  <span className="text-sm text-muted-foreground">7 scenes</span>
                </div>
                <Progress value={28} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pacing Analysis</CardTitle>
              <CardDescription>
                Tension and dramatic flow throughout your script
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-32 flex items-end justify-between space-x-1">
                {[20, 35, 45, 30, 60, 75, 55, 80, 90, 70, 85, 95].map((height, index) => (
                  <div
                    key={index}
                    className="bg-primary/20 flex-1 rounded-sm"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Tension peaks appropriately placed for maximum dramatic impact
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dialogue Quality</CardTitle>
              <CardDescription>
                Analysis of dialogue naturalness and readability
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Readability Score</span>
                  <span className="text-sm text-muted-foreground">92/100</span>
                </div>
                <Progress value={92} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Natural Flow</span>
                  <span className="text-sm text-muted-foreground">89/100</span>
                </div>
                <Progress value={89} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Character Voice</span>
                  <span className="text-sm text-muted-foreground">85/100</span>
                </div>
                <Progress value={85} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recommendations */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>AI Recommendations</CardTitle>
            <CardDescription>
              Suggestions to improve your screenplay based on industry standards
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="font-semibold text-sm">Consider Adding Conflict</h4>
              <p className="text-sm text-muted-foreground">
                Scene 3 shows low tension. Consider adding internal or external conflict to maintain audience engagement.
              </p>
            </div>
            <div className="border-l-4 border-green-500 pl-4">
              <h4 className="font-semibold text-sm">Strong Character Development</h4>
              <p className="text-sm text-muted-foreground">
                Sarah Chen's character arc shows excellent progression. Consider applying similar depth to secondary characters.
              </p>
            </div>
            <div className="border-l-4 border-orange-500 pl-4">
              <h4 className="font-semibold text-sm">Pacing Opportunity</h4>
              <p className="text-sm text-muted-foreground">
                The middle section could benefit from tighter pacing. Consider condensing scenes 8-12.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
