"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Clipboard, Film, Hash } from "lucide-react"
import type { FullProject, Scene, ScriptElement } from "@/services/project"
import { SCRIPT_ELEMENT_CONFIG } from "@/lib/helpers/screenplay-config"
import { Separator } from "@/components/ui/separator"

interface SidePanelProps {
  project: FullProject
  allScenes: Scene[]
  totalScenes: number
  totalElements: number
  onAddNewScene: () => void
  onScrollToElement: (id: string) => void
}

/**
 * A modular component for the entire left-side panel.
 * It contains the scene/structure tabs and project stats.
 */
export const SidePanel = React.memo(
  ({ project, allScenes, totalScenes, totalElements, onAddNewScene, onScrollToElement }: SidePanelProps) => {
    const [activeTab, setActiveTab] = useState("scenes")

    const getElementIcon = (elementType: ScriptElement["elementType"]) => {
      const config = SCRIPT_ELEMENT_CONFIG[elementType]
      if (config && typeof config.icon === "function") {
        const IconComponent = config.icon
        return <IconComponent className="h-3 w-3" />
      }
      return <Hash className="h-3 w-3" />
    }

    const getElementTypeColor = (elementType: ScriptElement["elementType"]) => {
      return SCRIPT_ELEMENT_CONFIG[elementType]?.badgeColor || "bg-gray-100 text-gray-700 border-gray-200"
    }

    return (
      <div className="w-80 border-r bg-muted/30 flex flex-col min-h-0">
        <div className="p-4 space-y-3 flex-shrink-0">
          <Button className="w-full justify-start gap-2 bg-transparent" variant="outline" onClick={onAddNewScene}>
            <Clipboard className="h-4 w-4" />
            Beat Board
          </Button>

          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <Film className="h-3 w-3" />
              {totalScenes} scenes
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Hash className="h-3 w-3" />
              {totalElements} elements
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-4 flex-shrink-0">
            <TabsList className="w-full">
              <TabsTrigger value="scenes" className="flex-1">
                Scenes
              </TabsTrigger>
              <TabsTrigger value="structure" className="flex-1">
                Structure
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Scene List Tab */}
          <TabsContent value="scenes" className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {allScenes.map((scene, index) => (
              <Card
                key={scene.id}
                className="hover:shadow-sm transition-shadow cursor-pointer group flex-shrink-0"
                onClick={() => onScrollToElement(scene.id)}
              >
                <CardContent className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm leading-tight group-hover:text-primary transition-colors">
                          {scene.setting.toUpperCase()}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">Scene {scene.sceneNumber || index + 1}</p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {scene.elements.length}
                      </Badge>
                    </div>

                    {scene.elements.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Array.from(new Set(scene.elements.map((el) => el.elementType)))
                          .slice(0, 4)
                          .map((type) => (
                            <div
                              key={type}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border ${getElementTypeColor(type)}`}
                            >
                              {getElementIcon(type)}
                              <span className="capitalize">{type.toLowerCase()}</span>
                            </div>
                          ))}
                        {Array.from(new Set(scene.elements.map((el) => el.elementType))).length > 4 && (
                          <Badge variant="secondary" className="text-xs">
                            +{Array.from(new Set(scene.elements.map((el) => el.elementType))).length - 4}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Structure View Tab */}
          <TabsContent value="structure" className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
            {project.acts?.map((act) => (
              <Card key={act.id} className="overflow-hidden flex-shrink-0">
                <CardContent className="p-0">
                  <div className="bg-muted/50 p-3 border-b">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-base flex items-center gap-2">
                        <Film className="h-4 w-4" />
                        Act {act.actNumber} {act.title && `- ${act.title}`}
                      </h3>
                      <Badge variant="secondary" className="text-xs">
                        {act.scenes.length} scenes
                      </Badge>
                    </div>
                  </div>

                  <div className="p-3 space-y-3">
                    {act.scenes.map((scene, sceneIndex) => (
                      <div key={scene.id} className="space-y-2">
                        <div
                          className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
                          onClick={() => onScrollToElement(scene.id)}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                              {sceneIndex + 1}
                            </div>
                            <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                              {scene.setting.toUpperCase()}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {scene.elements.length}
                          </Badge>
                        </div>

                        {scene.elements.length > 0 && (
                          <div className="ml-8 space-y-1">
                            {(() => {
                              const groupedElements = []
                              let i = 0

                              while (i < scene.elements.length) {
                                const currentElement = scene.elements[i]

                                if (currentElement.elementType === "CHARACTER") {
                                  // Group CHARACTER with following PARENTHETICAL and DIALOG
                                  const group = [currentElement]
                                  let j = i + 1

                                  // Check for PARENTHETICAL
                                  if (j < scene.elements.length && scene.elements[j].elementType === "PARENTHETICAL") {
                                    group.push(scene.elements[j])
                                    j++
                                  }

                                  // Check for DIALOG
                                  if (j < scene.elements.length && scene.elements[j].elementType === "DIALOG") {
                                    group.push(scene.elements[j])
                                    j++
                                  }

                                  groupedElements.push({ type: "group", elements: group })
                                  i = j
                                } else {
                                  // Standalone element
                                  groupedElements.push({ type: "single", element: currentElement })
                                  i++
                                }
                              }

                              return groupedElements.map((item, groupIndex) => {
                                if (item.type === "group") {
                                  return (
                                    <div key={`group-${groupIndex}`} className="space-y-1">
                                      {item.elements.map((el, elIndex) => (
                                        <div
                                          key={el.id}
                                          className={`flex items-center gap-2 p-1.5 rounded text-xs hover:bg-muted/30 cursor-pointer transition-colors group ${elIndex > 0 ? "ml-6 border-l-2 border-muted pl-3" : ""
                                            }`}
                                          onClick={() => onScrollToElement(el.id)}
                                        >
                                          <div
                                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${getElementTypeColor(el.elementType)}`}
                                          >
                                            {getElementIcon(el.elementType)}{" "}
                                            <span className="font-medium">{el.elementType.substring(0, 3)}</span>
                                          </div>
                                          <span className="text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1">
                                            {el.content}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                } else {
                                  return (
                                    <div
                                      key={item.element.id}
                                      className="flex items-center gap-2 p-1.5 rounded text-xs hover:bg-muted/30 cursor-pointer transition-colors group"
                                      onClick={() => onScrollToElement(item.element.id)}
                                    >
                                      <div
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${getElementTypeColor(item.element.elementType)}`}
                                      >
                                        {getElementIcon(item.element.elementType)}
                                        <span className="font-medium">{item.element.elementType.substring(0, 3)}</span>
                                      </div>
                                      <span className="text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1">
                                        {item.element.content}
                                      </span>
                                    </div>
                                  )
                                }
                              })
                            })()}
                          </div>
                        )}

                        {sceneIndex < act.scenes.length - 1 && <Separator className="ml-8" />}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    )
  },
)

SidePanel.displayName = "SidePanel"
