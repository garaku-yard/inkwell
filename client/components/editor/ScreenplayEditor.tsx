"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Download, FileText, Plus, ArrowLeft, Film, Users, MessageSquare, Camera, Zap, Hash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Toolbar } from "./Toolbar"
import type { FullProject, Scene, ScriptElement } from "@/services/project"

type ScriptElementType = ScriptElement["elementType"]

interface ScreenplayEditorProps {
  projectData: FullProject
}

const formatElement = (el: ScriptElement, isForEditor: boolean): string => {
  const content = el.content || ""
  switch (el.elementType) {
    case "ACTION":
      return content
    case "CHARACTER":
      return isForEditor ? `\t\t\t\t${content.toUpperCase()}` : content.toUpperCase()
    case "PARENTHETICAL":
      return isForEditor ? `\t\t\t(${content})` : `(${content})`
    case "DIALOG":
      return isForEditor ? `\t\t${content}` : content
    case "TRANSITION":
      return isForEditor ? `\t\t\t\t\t\t${content.toUpperCase()}` : content.toUpperCase()
    case "SHOT":
      return content.toUpperCase()
    default:
      return content
  }
}

const formatContentForEditor = (project: FullProject): string => {
  if (!project.acts || project.acts.length === 0) {
    return "FADE IN:\n\n"
  }

  return project.acts
    .map((act) => {
      return act.scenes
        .map((scene) => {
          const sceneHeader = scene.setting.toUpperCase()
          const formattedElements = scene.elements.map((el) => formatElement(el, true)).join("\n")
          return `${sceneHeader}\n${formattedElements}`
        })
        .join("\n\n\n")
    })
    .join("\n\n\n---\n\n\n")
}

const getElementIcon = (elementType: ScriptElementType) => {
  switch (elementType) {
    case "CHARACTER":
      return <Users className="h-3 w-3" />
    case "DIALOG":
      return <MessageSquare className="h-3 w-3" />
    case "ACTION":
      return <Film className="h-3 w-3" />
    case "SHOT":
      return <Camera className="h-3 w-3" />
    case "TRANSITION":
      return <Zap className="h-3 w-3" />
    default:
      return <Hash className="h-3 w-3" />
  }
}

const getElementTypeColor = (elementType: ScriptElementType) => {
  switch (elementType) {
    case "CHARACTER":
      return "bg-blue-100 text-blue-700 border-blue-200"
    case "DIALOG":
      return "bg-green-100 text-green-700 border-green-200"
    case "ACTION":
      return "bg-purple-100 text-purple-700 border-purple-200"
    case "SHOT":
      return "bg-orange-100 text-orange-700 border-orange-200"
    case "TRANSITION":
      return "bg-red-100 text-red-700 border-red-200"
    default:
      return "bg-gray-100 text-gray-700 border-gray-200"
  }
}

export function ScreenplayEditor({ projectData }: ScreenplayEditorProps) {
  const [content, setContent] = useState<string>("")
  const [activeTab, setActiveTab] = useState("scenes")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setContent(formatContentForEditor(projectData))
  }, [projectData])

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
  }

  const handleInsertElementTemplate = (type: ScriptElementType) => {
    const textarea = textareaRef.current
    if (!textarea) return

    let template = ""
    switch (type) {
      case "ACTION":
        template = "\n"
        break
      case "CHARACTER":
        template = "\n\n\t\t\t\tCHARACTER\n\t\t"
        break
      case "PARENTHETICAL":
        template = "\n\t\t\t()"
        break
      case "DIALOG":
        template = "\n\t\t"
        break
      case "TRANSITION":
        template = "\n\n\t\t\t\t\t\tCUT TO:"
        break
      case "SHOT":
        template = "\nSHOT: "
        break
    }

    const start = textarea.selectionStart
    const newText = textarea.value.substring(0, start) + template + textarea.value.substring(start)
    setContent(newText)

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        let newCursorPos = start + template.length
        if (type === "PARENTHETICAL") {
          newCursorPos = start + template.indexOf(")")
        }
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }

  const handleAddNewScene = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const newSceneTemplate = "\n\n\nINT. NEW LOCATION - DAY\n"
    const newText = textarea.value + newSceneTemplate
    setContent(newText)

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.scrollTop = textareaRef.current.scrollHeight
      }
    }, 0)
  }

  const scrollToText = (textToFind: string) => {
    if (!textareaRef.current) return

    const index = content.indexOf(textToFind)
    if (index !== -1) {
      textareaRef.current.focus()
      const textToLine = textareaRef.current.value.substring(0, index)
      const lines = textToLine.split("\n").length
      const lineHeight = textareaRef.current.scrollHeight / content.split("\n").length
      textareaRef.current.scrollTop = Math.max(0, (lines - 5) * lineHeight)
    }
  }

  const allScenes = projectData?.acts?.flatMap((act) => act.scenes) || []
  const totalScenes = allScenes.length
  const totalElements = allScenes.reduce((acc, scene) => acc + scene.elements.length, 0)

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b bg-background z-10">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="mr-2">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <FileText className="h-5 w-5" />
            <h1 className="text-lg font-medium">{projectData.projectName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2 bg-transparent">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 border-r bg-muted/30 flex flex-col">
          <div className="p-4 space-y-3">
            <Button className="w-full justify-start gap-2 bg-transparent" variant="outline" onClick={handleAddNewScene}>
              <Plus className="h-4 w-4" />
              New Scene
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

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="px-4">
              <TabsList className="w-full">
                <TabsTrigger value="scenes" className="flex-1">
                  Scenes
                </TabsTrigger>
                <TabsTrigger value="structure" className="flex-1">
                  Structure
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="scenes" className="flex-1 overflow-auto p-3 space-y-2">
              {allScenes.map((scene: Scene, index: number) => (
                <Card
                  key={scene.id}
                  className="hover:shadow-sm transition-shadow cursor-pointer group"
                  onClick={() => scrollToText(scene.setting.toUpperCase())}
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

            <TabsContent value="structure" className="flex-1 overflow-auto p-3 space-y-4">
              {projectData.acts?.map((act, actIndex) => (
                <Card key={act.id} className="overflow-hidden">
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
                            onClick={() => scrollToText(scene.setting.toUpperCase())}
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
                                    if (
                                      j < scene.elements.length &&
                                      scene.elements[j].elementType === "PARENTHETICAL"
                                    ) {
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
                                            onClick={() => scrollToText(formatElement(el, false))}
                                          >
                                            <div
                                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${getElementTypeColor(el.elementType)}`}
                                            >
                                              {getElementIcon(el.elementType)}
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
                                        onClick={() => scrollToText(formatElement(item.element, false))}
                                      >
                                        <div
                                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${getElementTypeColor(item.element.elementType)}`}
                                        >
                                          {getElementIcon(item.element.elementType)}
                                          <span className="font-medium">
                                            {item.element.elementType.substring(0, 3)}
                                          </span>
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

        <div className="flex-1 flex flex-col overflow-hidden">
          <Toolbar onInsertElementTemplate={handleInsertElementTemplate} onAddNewScene={handleAddNewScene} />
          <div className="flex-1 overflow-auto p-4 bg-background">
            <div className="max-w-[8.5in] mx-auto bg-white shadow-sm p-16 min-h-full font-mono">
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                className="text-base leading-relaxed resize-none border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-full min-h-[calc(100vh-12rem)]"
                placeholder="Start writing your screenplay..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
