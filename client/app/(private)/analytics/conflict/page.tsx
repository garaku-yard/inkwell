"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { ArrowLeft, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSearchParams } from 'next/navigation'

export default function ConflictHeatmap() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project') || '272b597d-63c1-4b29-9150-c0cefd009987'

  const conflictData = [
    { scene: 1, internal: 3, external: 7, interpersonal: 5, pages: [1, 2, 3] },
    { scene: 2, internal: 6, external: 4, interpersonal: 8, pages: [4, 5, 6] },
    { scene: 3, internal: 8, external: 9, interpersonal: 6, pages: [7, 8, 9, 10] },
    { scene: 4, internal: 4, external: 6, interpersonal: 3, pages: [11, 12] },
    { scene: 5, internal: 9, external: 8, interpersonal: 9, pages: [13, 14, 15, 16] },
  ]

  const getHeatmapColor = (intensity: number) => {
    if (intensity >= 8) return "bg-red-500"
    if (intensity >= 6) return "bg-orange-500"
    if (intensity >= 4) return "bg-yellow-500"
    return "bg-green-500"
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/analytics?project=${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
              ← Analytics
            </Link>
            <h1 className="text-xl font-semibold text-foreground">Conflict Heatmap</h1>
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
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Conflict Scenes</CardDescription>
              <CardTitle className="text-3xl font-bold">42</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">High conflict density</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Peak Conflict</CardDescription>
              <CardTitle className="text-3xl font-bold">Scene 5</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Maximum tension point</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Conflict Balance</CardDescription>
              <CardTitle className="text-3xl font-bold">Excellent</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Well-distributed conflicts</p>
            </CardContent>
          </Card>
        </div>

        {/* Conflict Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle>Page-by-Page Conflict Intensity</CardTitle>
            <CardDescription>
              Visual representation of conflict levels throughout your screenplay
            </CardDescription>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter by Type
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Legend */}
              <div className="flex items-center gap-4 text-sm">
                <span>Intensity:</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                  <span>Low (1-3)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                  <span>Medium (4-6)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-orange-500 rounded"></div>
                  <span>High (7-8)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-red-500 rounded"></div>
                  <span>Peak (9-10)</span>
                </div>
              </div>

              {/* Scene Breakdown */}
              <div className="space-y-3">
                {conflictData.map((scene, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">Scene {scene.scene}</h4>
                      <Badge variant="outline">Pages {scene.pages[0]}-{scene.pages[scene.pages.length - 1]}</Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Internal Conflict</span>
                          <span className="text-sm font-medium">{scene.internal}/10</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getHeatmapColor(scene.internal)}`}
                            style={{ width: `${scene.internal * 10}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">External Conflict</span>
                          <span className="text-sm font-medium">{scene.external}/10</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getHeatmapColor(scene.external)}`}
                            style={{ width: `${scene.external * 10}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Interpersonal</span>
                          <span className="text-sm font-medium">{scene.interpersonal}/10</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getHeatmapColor(scene.interpersonal)}`}
                            style={{ width: `${scene.interpersonal * 10}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conflict Analysis */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Conflict Types Distribution</CardTitle>
              <CardDescription>
                Breakdown of conflict types throughout your screenplay
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Internal Conflict</span>
                  <span className="text-sm font-medium">30%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full bg-blue-500" style={{ width: '30%' }}></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">External Conflict</span>
                  <span className="text-sm font-medium">45%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full bg-green-500" style={{ width: '45%' }}></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Interpersonal Conflict</span>
                  <span className="text-sm font-medium">25%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full bg-purple-500" style={{ width: '25%' }}></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
              <CardDescription>
                AI-powered suggestions for conflict optimization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-sm text-green-700">Strong External Conflict</h4>
                <p className="text-sm text-muted-foreground">
                  Your external conflicts drive the plot effectively, keeping readers engaged.
                </p>
              </div>

              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-sm text-blue-700">Develop Internal Conflict</h4>
                <p className="text-sm text-muted-foreground">
                  Consider deepening internal struggles in scenes 1-3 for better character development.
                </p>
              </div>

              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-sm text-orange-700">Balance Conflict Types</h4>
                <p className="text-sm text-muted-foreground">
                  Scene 4 has low conflict. Consider adding interpersonal tension to maintain momentum.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
