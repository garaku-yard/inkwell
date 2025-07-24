"use client"

import React, { useState, useRef } from "react"
import Link from "next/link"
import { Download, FileText, ArrowLeft, Film, Hash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Toolbar } from "./Toolbar"
import type { FullProject, Scene, ScriptElement } from "@/services/project"
import { cn } from "@/lib/utils"
import { SCRIPT_ELEMENT_CONFIG, ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"

type ScriptElementType = ScriptElement["elementType"]

interface ScreenplayEditorProps {
  projectData: FullProject
}

const EditableElement = React.forwardRef<
  HTMLDivElement,
  {
    element: ScriptElement | Scene
    onUpdate: (id: string, content: string, isScene: boolean) => void
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, elementId: string, isScene: boolean) => void
  }
>(({ element, onUpdate, onKeyDown }, ref) => {
  const isScene = "setting" in element
  const type = isScene ? "SCENE_HEADING" : element.elementType
  const content = isScene ? element.setting : element.content
  const config = SCRIPT_ELEMENT_CONFIG[type]

  return (
    <div
      ref={ref}
      data-id={element.id}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onUpdate(element.id, e.currentTarget.textContent || "", isScene)}
      onKeyDown={(e) => onKeyDown(e, element.id, isScene)}
      className={cn("outline-none w-full", config.editorClasses)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
})

EditableElement.displayName = "EditableElement"

export function ScreenplayEditor({ projectData: initialProjectData }: ScreenplayEditorProps) {
  const [project, setProject] = useState(initialProjectData)
  const [activeTab, setActiveTab] = useState("scenes")
  const elementRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())

  const handleUpdateElement = (id: string, newContent: string, isScene: boolean) => {
    setProject((prevProject) => {
      const newActs = prevProject.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((scene) => {
          if (isScene && scene.id === id) {
            return { ...scene, setting: newContent }
          }
          return {
            ...scene,
            elements: scene.elements.map((el) => (el.id === id ? { ...el, content: newContent } : el)),
          }
        }),
      }))
      return { ...prevProject, acts: newActs }
    })
  }

  const findActiveElement = (): { elementId: string; isScene: boolean } | null => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    let node: Node | null = selection.getRangeAt(0).startContainer
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).hasAttribute("data-id")) {
        const elementNode = node as HTMLElement
        const id = elementNode.getAttribute("data-id")!
        const isScene = !!elementNode.closest(".scene-container > [data-id]")
        return { elementId: id, isScene }
      }
      node = node.parentNode
    }
    return null
  }

  const handleInsertElement = (type: ScriptElementType) => {
    const activeElementInfo = findActiveElement()
    if (!activeElementInfo) {
      console.warn("Could not find active element to insert after.")
      return
    }

    const { elementId, isScene } = activeElementInfo
    let sceneId = ""
    let insertIndex = -1

    for (const act of project.acts) {
      for (const scene of act.scenes) {
        if (isScene && scene.id === elementId) {
          sceneId = scene.id
          insertIndex = 0
          break
        }
        const foundIndex = scene.elements.findIndex((el) => el.id === elementId)
        if (foundIndex !== -1) {
          sceneId = scene.id
          insertIndex = foundIndex + 1
          break
        }
      }
      if (sceneId) break
    }

    if (!sceneId) return

    const newElement: ScriptElement = {
      id: `new-${Date.now()}`,
      elementType: type,
      content: "",
      sceneId,
      elementOrder: insertIndex,
      characterId: null,
    }

    setProject((prevProject) => {
      const newActs = prevProject.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene
          const newElements = [...scene.elements]
          newElements.splice(insertIndex, 0, newElement)
          return { ...scene, elements: newElements }
        }),
      }))
      return { ...prevProject, acts: newActs }
    })

    setTimeout(() => {
      const newElementNode = elementRefs.current.get(newElement.id)
      if (newElementNode) {
        newElementNode.focus()
      }
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleInsertElement("ACTION")
    }
  }

  const handleAddNewScene = () => {
    setProject((prevProject) => {
      const newActs = [...prevProject.acts]
      let lastAct = newActs[newActs.length - 1]

      if (!lastAct) {
        lastAct = {
          id: `new-act-${Date.now()}`,
          actNumber: 1,
          title: "Act 1",
          scenes: [],
          projectId: prevProject.id,
        }
        newActs.push(lastAct)
      }

      const newSceneId = `new-scene-${Date.now()}`
      const newScene: Scene = {
        id: newSceneId,
        sceneNumber: lastAct.scenes.length + 1,
        setting: "INT. NEW SCENE - DAY",
        elements: [
          {
            id: `new-element-${Date.now()}`,
            elementType: "ACTION",
            content: "A new beginning.",
            sceneId: newSceneId,
            elementOrder: 0,
            characterId: null,
          },
        ],
        actId: ""
      }

      lastAct.scenes.push(newScene)
      return { ...prevProject, acts: newActs }
    })
  }

  const allScenes = project?.acts?.flatMap((act) => act.scenes) || []
  const totalScenes = allScenes.length
  const totalElements = allScenes.reduce((acc, scene) => acc + scene.elements.length, 0)

  const scrollToElement = (elementId: string) => {
    const node = elementRefs.current.get(elementId)
    node?.scrollIntoView({ behavior: "smooth", block: "center" })
    node?.focus()
  }

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
            <h1 className="text-lg font-medium">{project.projectName}</h1>
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
        <div className="w-80 border-r bg-muted/30 flex flex-col min-h-0">
          <div className="p-4 space-y-3 flex-shrink-0">
            <Button className="w-full justify-start gap-2 bg-transparent" variant="outline" onClick={handleAddNewScene}>
              <FileText className="h-4 w-4" />
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

            <TabsContent value="scenes" className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              {allScenes.map((scene, index) => (
                <Card
                  key={scene.id}
                  className="hover:shadow-sm transition-shadow cursor-pointer group flex-shrink-0"
                  onClick={() => scrollToElement(scene.id)}
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
                            .map((type) => {
                              const Icon = SCRIPT_ELEMENT_CONFIG[type].icon
                              return (
                                <div
                                  key={type}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border ${SCRIPT_ELEMENT_CONFIG[type].badgeColor}`}
                                >
                                  <Icon className="h-3 w-3" />
                                  <span className="capitalize">{type.toLowerCase()}</span>
                                </div>
                              )
                            })}
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
                            onClick={() => scrollToElement(scene.id)}
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
                                const groupedElements: Array<
                                  { type: "group"; elements: ScriptElement[] } | { type: "single"; element: ScriptElement }
                                > = []
                                let i = 0

                                while (i < scene.elements.length) {
                                  const currentElement = scene.elements[i]

                                  if (currentElement.elementType === "CHARACTER") {
                                    const group: ScriptElement[] = [currentElement]
                                    let j = i + 1

                                    if (
                                      j < scene.elements.length &&
                                      scene.elements[j].elementType === "PARENTHETICAL"
                                    ) {
                                      group.push(scene.elements[j])
                                      j++
                                    }

                                    if (j < scene.elements.length && scene.elements[j].elementType === "DIALOG") {
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
                                  if (item.type === "group" && item.elements) {
                                    return (
                                      <div key={`group-${groupIndex}`} className="space-y-1">
                                        {item.elements.map((el, elIndex) => {
                                          const Icon = SCRIPT_ELEMENT_CONFIG[el.elementType].icon
                                          return (
                                            <div
                                              key={el.id}
                                              className={`flex items-center gap-2 p-1.5 rounded text-xs hover:bg-muted/30 cursor-pointer transition-colors group ${elIndex > 0 ? "ml-6 border-l-2 border-muted pl-3" : ""
                                                }`}
                                              onClick={() => scrollToElement(el.id)}
                                            >
                                              <div
                                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${SCRIPT_ELEMENT_CONFIG[el.elementType].badgeColor
                                                  }`}
                                              >
                                                <Icon className="h-3 w-3" />
                                                <span className="font-medium">{el.elementType.substring(0, 3)}</span>
                                              </div>
                                              <span className="text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1">
                                                {el.content}
                                              </span>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )
                                  } else if (item.type === "single" && item.element) {
                                    const Icon = SCRIPT_ELEMENT_CONFIG[item.element.elementType].icon
                                    return (
                                      <div
                                        key={item.element.id}
                                        className="flex items-center gap-2 p-1.5 rounded text-xs hover:bg-muted/30 cursor-pointer transition-colors group"
                                        onClick={() => scrollToElement(item.element.id)}
                                      >
                                        <div
                                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${SCRIPT_ELEMENT_CONFIG[item.element.elementType].badgeColor
                                            }`}
                                        >
                                          <Icon className="h-3 w-3" />
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
                                  return null
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
          <Toolbar onInsertElement={handleInsertElement} onAddNewScene={handleAddNewScene} />
          <div className="flex-1 overflow-auto p-8 bg-gray-100 dark:bg-gray-900">
            <div className="w-[8.5in] min-h-[11in] mx-auto bg-white shadow-2xl p-[1in] font-mono text-base leading-relaxed space-y-1">
              {project.acts?.map((act) =>
                act.scenes.map((scene) => (
                  <div key={scene.id} className="scene-container mb-4">
                    <EditableElement
                      ref={(el) => {
                        if (el) elementRefs.current.set(scene.id, el)
                      }}
                      element={scene}
                      onUpdate={handleUpdateElement}
                      onKeyDown={handleKeyDown}
                    />
                    {scene.elements.map((el) => (
                      <EditableElement
                        key={el.id}
                        ref={(elNode) => {
                          if (elNode) elementRefs.current.set(el.id, elNode)
                        }}
                        element={el}
                        onUpdate={handleUpdateElement}
                        onKeyDown={handleKeyDown}
                      />
                    ))}
                  </div>
                )),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
