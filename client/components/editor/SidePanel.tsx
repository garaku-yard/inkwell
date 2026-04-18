"use client"

import React, { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Clipboard, Film, Hash, MessageCircle } from "lucide-react"
import type { FullProject, Scene, ScriptElement, Comment } from "@/services/project"
import { getComments } from "@/services/project"
import { SCRIPT_ELEMENT_CONFIG, type ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { Separator } from "@/components/ui/separator"
import { CommentPanel } from "./CommentPanel"

type ActiveScriptItem = (Scene & { isScene: true; comments?: Comment[] }) | (ScriptElement & { isScene: false; comments?: Comment[] })

type GroupedItem = { type: "group"; elements: ScriptElement[] } | { type: "single"; element: ScriptElement }

interface SidePanelProps {
  project: FullProject
  allScenes: Scene[]
  totalScenes: number
  totalElements: number
  onScrollToElement: (id: string) => void
  activeElementId: string | null
  onAddComment: (elementId: string, isScene: boolean, content: string) => void
  onUpdateComment: (commentId: string, content: string) => void
  onDeleteComment: (commentId: string) => void
  onToggleCommentResolved: (elementId: string, commentId: string, isScene: boolean, newResolvedState: boolean) => void
  refreshTrigger?: number
}

export const SidePanel = React.memo(
  React.forwardRef<HTMLDivElement, SidePanelProps>(
    (
      {
        project,
        allScenes,
        totalScenes,
        totalElements,
        onScrollToElement,
        activeElementId,
        onAddComment,
        onUpdateComment,
        onDeleteComment,
        onToggleCommentResolved,
        refreshTrigger,
      },
      ref,
    ) => {
      const [activeTab, setActiveTab] = useState("scenes")
      const [allComments, setAllComments] = useState<Comment[]>([])
      const [commentsLoading, setCommentsLoading] = useState(false)
      const router = useRouter()

      useEffect(() => {
        loadAllComments()
      }, [project.id, refreshTrigger])

      const loadAllComments = async () => {
        setCommentsLoading(true)
        try {
          const projectComments = await getComments(project.id)
          setAllComments(projectComments)
        } catch (error) {
          console.error('Failed to load comments:', error)
          setAllComments([])
        } finally {
          setCommentsLoading(false)
        }
      };

      const getElementIcon = (elementType: ScriptElement["element_type"]) => {
        const config = SCRIPT_ELEMENT_CONFIG[elementType as keyof typeof SCRIPT_ELEMENT_CONFIG]
        if (config && typeof config.icon === "function") {
          const IconComponent = config.icon
          return <IconComponent className="h-3 w-3" />
        }
        return <Hash className="h-3 w-3" />
      }

      const getElementTypeColor = (elementType: ScriptElement["element_type"]) => {
        return SCRIPT_ELEMENT_CONFIG[elementType as keyof typeof SCRIPT_ELEMENT_CONFIG]?.badgeColor || "bg-gray-100 text-gray-700 border-gray-200"
      }

      const getCommentCount = (elementId: string) => {
        return allComments.filter(comment => comment.elementId === elementId).length
      }

      const handleBeatBoardClick = (projectId: string) => {
        router.push(`/projects/${projectId}/beat-board`)
      }

      const activeElement = useMemo((): ActiveScriptItem | null => {
        if (!activeElementId) return null

        const elementComments = allComments.filter(comment => comment.elementId === activeElementId)

        if (project.scenes) {
          for (const scene of project.scenes) {
            if (scene.id === activeElementId) {
              return { ...scene, isScene: true, comments: elementComments }
            }
            const foundElement = scene.elements?.find((el) => el.id === activeElementId)
            if (foundElement) {
              return { ...foundElement, isScene: false, comments: elementComments }
            }
          }
        }
        return null
      }, [activeElementId, project.scenes, allComments])

      const unresolvedCommentsCount = useMemo(() => {
        if (!activeElement) return 0
        return activeElement.comments?.filter((c) => !c.isResolved).length || 0
      }, [activeElement])

      return (
        <div ref={ref} className="w-80 border-r bg-muted/30 flex flex-col min-h-0">
          <div className="p-4 space-y-3 flex-shrink-0">
            <Button
              className="w-full justify-start gap-2 bg-transparent"
              variant="outline"
              onClick={() => handleBeatBoardClick(project.id)}
            >
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
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="scenes">Scenes</TabsTrigger>
                <TabsTrigger value="structure">Structure</TabsTrigger>
                <TabsTrigger value="comments" className="relative">
                  Comments
                  {unresolvedCommentsCount > 0 && (
                    <Badge
                      className="absolute -top-1 right-1 h-2.5 w-2.5 p-0 rounded-full flex items-center justify-center bg-blue-500"
                    >
                      <span className="sr-only">{unresolvedCommentsCount} unresolved comments</span>
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

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
                            {scene.scene_heading.toUpperCase()}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">Scene {index + 1}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className="text-xs">
                            {scene.elements?.length || 0}
                          </Badge>
                          {getCommentCount(scene.id) > 0 && (
                            <Badge variant="secondary" className="text-xs flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />
                              {getCommentCount(scene.id)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {scene.elements && scene.elements.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Array.from(new Set(scene.elements.map((el) => el.element_type).filter(Boolean)))
                            .slice(0, 4)
                            .map((type) => (
                              <div
                                key={type}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border ${getElementTypeColor(
                                  type,
                                )}`}
                              >
                                {getElementIcon(type)}
                                <span className="capitalize">{type.toLowerCase()}</span>
                              </div>
                            ))}
                          {Array.from(new Set(scene.elements.map((el) => el.element_type).filter(Boolean))).length > 4 && (
                            <Badge variant="secondary" className="text-xs">
                              +{Array.from(new Set(scene.elements.map((el) => el.element_type).filter(Boolean))).length - 4}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="structure" className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
              {project.scenes && project.scenes.length > 0 ? (
                <Card className="overflow-hidden flex-shrink-0">
                  <CardContent className="p-0">
                    <div className="bg-muted/50 p-3 border-b">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-base flex items-center gap-2">
                          <Film className="h-4 w-4" />
                          All Scenes
                        </h3>
                        <Badge variant="secondary" className="text-xs">
                          {project.scenes.length} scenes
                        </Badge>
                      </div>
                    </div>

                    <div className="p-3 space-y-3">
                      {project.scenes.map((scene, sceneIndex) => (
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
                                {scene.scene_heading.toUpperCase()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Badge variant="outline" className="text-xs">
                                {scene.elements?.length || 0}
                              </Badge>
                              {getCommentCount(scene.id) > 0 && (
                                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                  <MessageCircle className="h-3 w-3" />
                                  {getCommentCount(scene.id)}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {scene.elements && scene.elements.length > 0 && (
                            <div className="ml-8 space-y-1">
                              {(() => {
                                const groupedElements: GroupedItem[] = []
                                let i = 0

                                while (i < scene.elements.length) {
                                  const currentElement = scene.elements[i]

                                  if (currentElement.element_type === "CHARACTER") {
                                    const group = [currentElement]
                                    let j = i + 1
                                    if (
                                      j < scene.elements.length &&
                                      scene.elements[j].element_type === "PARENTHETICAL"
                                    ) {
                                      group.push(scene.elements[j])
                                      j++
                                    }
                                    if (j < scene.elements.length && scene.elements[j].element_type === "DIALOG") {
                                      group.push(scene.elements[j])
                                      j++
                                    }
                                    groupedElements.push({ type: "group", elements: group })
                                    i = j
                                  } else {
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
                                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${getElementTypeColor(
                                                el.element_type,
                                              )}`}
                                            >
                                              {getElementIcon(el.element_type)}{" "}
                                              <span className="font-medium">{el.element_type.substring(0, 3)}</span>
                                            </div>
                                            <span className="text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1">
                                              {el.content}
                                            </span>
                                            {getCommentCount(el.id) > 0 && (
                                              <Badge variant="secondary" className="text-xs flex items-center gap-1 ml-1">
                                                <MessageCircle className="h-3 w-3" />
                                                {getCommentCount(el.id)}
                                              </Badge>
                                            )}
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
                                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${getElementTypeColor(
                                            item.element.element_type,
                                          )}`}
                                        >
                                          {getElementIcon(item.element.element_type)}
                                          <span className="font-medium">
                                            {item.element.element_type.substring(0, 3)}
                                          </span>
                                        </div>
                                        <span className="text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1">
                                          {item.element.content}
                                        </span>
                                        {getCommentCount(item.element.id) > 0 && (
                                          <Badge variant="secondary" className="text-xs flex items-center gap-1 ml-1">
                                            <MessageCircle className="h-3 w-3" />
                                            {getCommentCount(item.element.id)}
                                          </Badge>
                                        )}
                                      </div>
                                    )
                                  }
                                })
                              })()}
                            </div>
                          )}

                          {sceneIndex < (project.scenes?.length ?? 0) - 1 && <Separator className="ml-8" />}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No scenes yet. Start writing to see the structure.
                </div>
              )}
            </TabsContent>

            <TabsContent value="comments" className="flex-1 min-h-0">
              <CommentPanel
                activeElement={activeElement}
                onAddComment={onAddComment}
                onUpdateComment={onUpdateComment}
                onDeleteComment={onDeleteComment}
                onToggleCommentResolved={onToggleCommentResolved}
              />
            </TabsContent>
          </Tabs>
        </div>
      )
    },
  ),
)

SidePanel.displayName = "SidePanel"
