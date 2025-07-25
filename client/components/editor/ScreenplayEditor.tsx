"use client"
import type React from "react"
import { useState, useRef, useCallback, useMemo } from "react"
import Link from "next/link"
import { Download, FileText, ArrowLeft } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { Button } from "@/components/ui/button"
import { Toolbar } from "./Toolbar"
import { SidePanel } from "./SidePanel"
import { EditorPane, type EditorPaneRef } from "./EditorPane"
import type { FullProject, Scene, ScriptElement } from "@/services/project"
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { updateSceneSetting, updateScriptElementContent, createElement } from "@/services/project"

type ScriptItem = { type: "SCENE_HEADING"; data: Scene } | { type: "ELEMENT"; data: ScriptElement }

interface ScreenplayEditorProps {
  projectData: FullProject
}

/**
 * The main orchestrator component. It manages state and passes data
 * down to its modular children: SidePanel, Toolbar, and EditorPane.
 */
export function ScreenplayEditor({ projectData: initialProjectData }: ScreenplayEditorProps) {
  const [project, setProject] = useState(initialProjectData)
  const [activeElementId, setActiveElementId] = useState<string | null>(null)
  const elementRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const editorPaneRef = useRef<EditorPaneRef>(null)

  const debouncedSave = useDebouncedCallback(
    (id: string, content: string, isScene: boolean) => {
      console.log("Saving to database...")
      if (isScene) {
        updateSceneSetting(id, content).catch((err) => console.error("Scene save failed:", err))
      } else {
        updateScriptElementContent(id, content).catch((err) => console.error("Element save failed:", err))
      }
    },
    1500, // Wait 1.5 seconds after user stops typing.
  )

  const allScenes = useMemo(() => project?.acts?.flatMap((act) => act.scenes) || [], [project.acts])
  const totalScenes = allScenes.length
  const totalElements = useMemo(
    () => allScenes.reduce((acc, scene) => acc + scene.elements.length, 0),
    [allScenes],
  )

  const flattenedScriptItems: ScriptItem[] = useMemo(() => {
    if (!project?.acts?.length) return []
    return project.acts.flatMap(
      (act) =>
        act.scenes.flatMap((scene) => [
          { type: "SCENE_HEADING", data: scene },
          ...(scene.elements.map((el): ScriptItem => ({ type: "ELEMENT", data: el })) || []),
        ]) || [],
    )
  }, [project.acts])

  const handleUpdateElement = useCallback(
    (id: string, newContent: string, isScene: boolean) => {
      // 1. Update local state immediately for a responsive UI.
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

      // 2. Trigger the debounced save to the database.
      debouncedSave(id, newContent, isScene)
    },
    [debouncedSave],
  )

  const findActiveElement = useCallback((): { elementId: string; isScene: boolean } | null => {
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
  }, [])

  const handleInsertElement = useCallback(
    (type: ToolbarScriptElementType) => {
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

      const newElementData: Partial<ScriptElement> = {
        elementType: type,
        content: "",
        elementOrder: insertIndex,
      }

      createElement(sceneId, newElementData)
        .then((createdElement) => {
          setProject((prevProject) => {
            const newActs = prevProject.acts.map((act) => ({
              ...act,
              scenes: act.scenes.map((scene) => {
                if (scene.id !== sceneId) return scene
                const newElements = [...scene.elements]
                newElements.splice(insertIndex, 0, createdElement)
                newElements.forEach((el, index) => (el.elementOrder = index + 1))
                return { ...scene, elements: newElements }
              }),
            }))
            return { ...prevProject, acts: newActs }
          })

          setTimeout(() => {
            const newElementNode = elementRefs.current.get(createdElement.id)
            if (newElementNode) {
              newElementNode.focus()
            }
          }, 0)
        })
        .catch((err) => {
          console.error("Failed to create new element:", err)
        })
    },
    [findActiveElement, project.acts],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleInsertElement("ACTION")
      }
    },
    [handleInsertElement],
  )

  const handleAddNewScene = useCallback(() => {
    setProject((prevProject) => {
      const newActs = [...(prevProject.acts || [])]
      let lastAct = newActs[newActs.length - 1]
      if (!lastAct) {
        lastAct = {
          id: `new-act-${Date.now()}`,
          actNumber: 1,
          title: "Act 1",
          projectId: prevProject.id,
          scenes: [],
        }
        newActs.push(lastAct)
      }

      lastAct.scenes = lastAct.scenes || []
      const sceneId = `new-scene-${Date.now()}`
      const elementId = `new-element-${Date.now()}`

      const newScene: Scene = {
        id: sceneId,
        actId: lastAct.id,
        sceneNumber: lastAct.scenes.length + 1,
        setting: "INT. NEW SCENE - DAY",
        elements: [
          {
            id: elementId,
            sceneId: sceneId,
            elementOrder: 1,
            elementType: "ACTION",
            content: "A new beginning.",
            characterId: null,
          },
        ],
      }
      lastAct.scenes.push(newScene)
      return { ...prevProject, acts: newActs }
    })
  }, [])

  const scrollToElement = useCallback(
    (elementId: string) => {
      const itemIndex = flattenedScriptItems.findIndex((item) => item.data.id === elementId)
      if (itemIndex !== -1) {
        editorPaneRef.current?.scrollToIndex(itemIndex)
      }
    },
    [flattenedScriptItems],
  )

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
        <SidePanel
          project={project}
          allScenes={allScenes}
          totalScenes={totalScenes}
          totalElements={totalElements}
          onAddNewScene={handleAddNewScene}
          onScrollToElement={scrollToElement}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Toolbar onInsertElement={handleInsertElement} onAddNewScene={handleAddNewScene} />
          <EditorPane
            ref={editorPaneRef}
            items={flattenedScriptItems}
            elementRefs={elementRefs}
            onUpdate={handleUpdateElement}
            onKeyDown={handleKeyDown}
            activeElementId={activeElementId}
            setActiveElementId={setActiveElementId}
          />
        </div>
      </div>
    </div>
  )
}
