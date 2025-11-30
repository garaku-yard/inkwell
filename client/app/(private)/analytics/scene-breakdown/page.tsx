"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ArrowLeft, Clock, MapPin, Users, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useSearchParams } from 'next/navigation'

export default function SceneBreakdown() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project') || '272b597d-63c1-4b29-9150-c0cefd009987'

  const scenes = [
    {
      id: 1,
      title: "Opening - Sarah's Discovery",
      pages: 3,
      duration: "3-4 min",
      location: "Laboratory",
      timeOfDay: "Night",
      characters: ["Sarah", "Dr. Chen"],
      purpose: "Inciting Incident",
      emotions: ["Curiosity", "Concern"],
      plotPoints: ["Discovery of anomaly", "First hint of larger conspiracy"],
      pacing: 7,
      tension: 6
    },
    {
      id: 2,
      title: "Marcus Confrontation",
      pages: 4,
      duration: "4-5 min",
      location: "Office Building",
      timeOfDay: "Day",
      characters: ["Sarah", "Marcus", "Elena"],
      purpose: "Character Development",
      emotions: ["Anger", "Determination"],
      plotPoints: ["Reveal of Marcus's involvement", "Alliance formation"],
      pacing: 8,
      tension: 9
    },
    {
      id: 3,
      title: "The Chase Sequence",
      pages: 6,
      duration: "6-7 min",
      location: "City Streets",
      timeOfDay: "Dusk",
      characters: ["Sarah", "Elena", "Antagonists"],
      purpose: "Action/Suspense",
      emotions: ["Fear", "Urgency"],
      plotPoints: ["Failed escape attempt", "Elena's sacrifice"],
      pacing: 9,
      tension: 10
    },
    {
      id: 4,
      title: "Quiet Resolution",
      pages: 2,
      duration: "2-3 min",
      location: "Safe House",
      timeOfDay: "Dawn",
      characters: ["Sarah", "Marcus"],
      purpose: "Denouement",
      emotions: ["Relief", "Melancholy"],
      plotPoints: ["Truth revealed", "New beginning"],
      pacing: 4,
      tension: 3
    }
  ]

  const sceneMetrics = {
    totalScenes: scenes.length,
    averageLength: 3.75,
    totalPages: scenes.reduce((sum, scene) => sum + scene.pages, 0),
    pacingVariation: 8.2,
    tensionCurve: 7.5
  }

  const getEmotionColor = (emotion: string) => {
    const colors: { [key: string]: string } = {
      "Curiosity": "bg-blue-100 text-blue-800",
      "Concern": "bg-yellow-100 text-yellow-800",
      "Anger": "bg-red-100 text-red-800",
      "Determination": "bg-green-100 text-green-800",
      "Fear": "bg-purple-100 text-purple-800",
      "Urgency": "bg-orange-100 text-orange-800",
      "Relief": "bg-blue-100 text-blue-800",
      "Melancholy": "bg-gray-100 text-gray-800"
    }
    return colors[emotion] || "bg-gray-100 text-gray-800"
  }

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
              <CardDescription>Total Scenes</CardDescription>
              <CardTitle className="text-3xl font-bold">{sceneMetrics.totalScenes}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{sceneMetrics.totalPages} pages total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Avg Scene Length</CardDescription>
              <CardTitle className="text-3xl font-bold">{sceneMetrics.averageLength}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Pages per scene</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Pacing Variation</CardDescription>
              <CardTitle className="text-3xl font-bold">{sceneMetrics.pacingVariation}/10</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Good rhythm</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Tension Curve</CardDescription>
              <CardTitle className="text-3xl font-bold">{sceneMetrics.tensionCurve}/10</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Well structured</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Analysis */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Scene Overview</TabsTrigger>
            <TabsTrigger value="structure">Structure Analysis</TabsTrigger>
            <TabsTrigger value="emotions">Emotional Journey</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="space-y-4">
              {scenes.map((scene, index) => (
                <Card key={scene.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          Scene {scene.id}: {scene.title}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {scene.pages} pages • {scene.duration}
                        </CardDescription>
                      </div>
                      <Badge variant="outline">{scene.purpose}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{scene.location}</span>
                          <Clock className="h-4 w-4 text-muted-foreground ml-4" />
                          <span>{scene.timeOfDay}</span>
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>Characters: {scene.characters.join(", ")}</span>
                        </div>

                        <div>
                          <span className="text-sm font-medium">Emotions:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {scene.emotions.map((emotion, i) => (
                              <Badge key={i} className={`text-xs ${getEmotionColor(emotion)}`}>
                                {emotion}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Pacing</span>
                            <span className="text-sm font-medium">{scene.pacing}/10</span>
                          </div>
                          <Progress value={scene.pacing * 10} className="h-2" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Tension</span>
                            <span className="text-sm font-medium">{scene.tension}/10</span>
                          </div>
                          <Progress value={scene.tension * 10} className="h-2" />
                        </div>

                        <div>
                          <span className="text-sm font-medium">Key Plot Points:</span>
                          <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                            {scene.plotPoints.map((point, i) => (
                              <li key={i} className="flex items-center gap-2">
                                <Target className="h-3 w-3" />
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="structure" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Scene Length Distribution</CardTitle>
                  <CardDescription>
                    How your scenes are paced throughout the screenplay
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {scenes.map((scene, index) => (
                    <div key={scene.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Scene {scene.id}</span>
                        <span className="text-sm font-medium">{scene.pages} pages</span>
                      </div>
                      <Progress value={(scene.pages / 6) * 100} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tension & Pacing Curve</CardTitle>
                  <CardDescription>
                    Visual representation of dramatic tension
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {scenes.map((scene, index) => (
                      <div key={scene.id} className="flex items-center gap-4">
                        <span className="text-sm w-16">Scene {scene.id}</span>
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>Tension</span>
                            <span>{scene.tension}/10</span>
                          </div>
                          <Progress value={scene.tension * 10} className="h-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="emotions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Emotional Journey Map</CardTitle>
                <CardDescription>
                  Track the emotional progression throughout your screenplay
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="font-semibold mb-3">Emotion Distribution</h4>
                    <div className="space-y-2">
                      {["Fear", "Determination", "Anger", "Curiosity", "Relief"].map((emotion, index) => (
                        <div key={emotion} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{emotion}</span>
                            <span className="text-sm font-medium">{Math.floor(Math.random() * 30 + 10)}%</span>
                          </div>
                          <Progress value={Math.floor(Math.random() * 30 + 10)} className="h-2" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3">Character Emotional Arcs</h4>
                    <div className="space-y-3">
                      {["Sarah", "Marcus", "Elena"].map((character, index) => (
                        <div key={character} className="border rounded-lg p-3">
                          <h5 className="font-medium text-sm mb-2">{character}</h5>
                          <div className="text-xs text-muted-foreground">
                            {character === "Sarah" && "Curiosity → Fear → Determination → Relief"}
                            {character === "Marcus" && "Suspicion → Anger → Understanding → Hope"}
                            {character === "Elena" && "Concern → Urgency → Sacrifice → Peace"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Structural Strengths</CardTitle>
                  <CardDescription>
                    What's working well in your scene structure
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-semibold text-sm text-green-700">Strong Opening Hook</h4>
                    <p className="text-sm text-muted-foreground">
                      Scene 1 effectively establishes intrigue and draws readers in.
                    </p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-semibold text-sm text-green-700">Excellent Tension Escalation</h4>
                    <p className="text-sm text-muted-foreground">
                      Scenes 2-3 build tension effectively toward the climax.
                    </p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-semibold text-sm text-green-700">Good Pacing Variation</h4>
                    <p className="text-sm text-muted-foreground">
                      Mix of short and long scenes creates good rhythm.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Areas for Improvement</CardTitle>
                  <CardDescription>
                    Suggestions to enhance your scene structure
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-l-4 border-orange-500 pl-4">
                    <h4 className="font-semibold text-sm text-orange-700">Strengthen Scene 4 Purpose</h4>
                    <p className="text-sm text-muted-foreground">
                      Consider adding more closure or setup for sequel to Scene 4.
                    </p>
                  </div>

                  <div className="border-l-4 border-blue-500 pl-4">
                    <h4 className="font-semibold text-sm text-blue-700">Balance Character Screen Time</h4>
                    <p className="text-sm text-muted-foreground">
                      Elena could use more development in earlier scenes.
                    </p>
                  </div>

                  <div className="border-l-4 border-yellow-500 pl-4">
                    <h4 className="font-semibold text-sm text-yellow-700">Consider Adding Transition</h4>
                    <p className="text-sm text-muted-foreground">
                      A brief transition scene between 3 and 4 might help pacing.
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
