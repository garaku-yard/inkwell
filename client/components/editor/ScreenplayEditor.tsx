"use client"

import type React from "react"
import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import Link from "next/link"
import { Download, FileText, ArrowLeft } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { Button } from "@/components/ui/button"
import { Toolbar } from "./Toolbar"
import { SidePanel } from "./SidePanel"
import { EditorPane, type EditorPaneRef } from "./EditorPane"
import type { FullProject, Scene, ScriptElement } from "@/services/project"
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { updateSceneSetting, updateScriptElementContent, createElement, deleteScriptElement } from "@/services/project"

type ScriptItem = { type: "SCENE_HEADING"; data: Scene } | { type: "ELEMENT"; data: ScriptElement }

interface ScreenplayEditorProps {
  projectData: FullProject
}

export function ScreenplayEditor({ projectData: initialProjectData }: ScreenplayEditorProps) {
  const [project, setProject] = useState(initialProjectData)
  const [activeElementId, setActiveElementId] = useState<string | null>(null)
  const [activeElementType, setActiveElementType] = useState<ToolbarScriptElementType | null>(null)
  const [elementToFocus, setElementToFocus] = useState<string | null>(null)
  const elementRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const editorPaneRef = useRef<EditorPaneRef>(null)

  const debouncedSave = useDebouncedCallback(
    (id: string, content: string, isScene: boolean) => {
      if (id.startsWith("new-")) return
      console.log("Saving to database...")
      if (isScene) {
        updateSceneSetting(id, content).catch((err) => console.error("Scene save failed:", err))
      } else {
        updateScriptElementContent(id, content).catch((err) => console.error("Element save failed:", err))
      }
    },
    1500,
  )

  const allScenes = useMemo(() => project?.acts?.flatMap((act) => act.scenes) || [], [project.acts])
  const totalScenes = allScenes.length
  const totalElements = useMemo(
    () => allScenes.reduce((acc, scene) => acc + (scene.elements?.length || 0), 0),
    [allScenes],
  )

  const flattenedScriptItems: ScriptItem[] = useMemo(() => {
    if (!project?.acts?.length) return []
    return project.acts.flatMap(
      (act) =>
        act.scenes.flatMap((scene) => [
          { type: "SCENE_HEADING", data: scene },
          ...(scene.elements?.map((el): ScriptItem => ({ type: "ELEMENT", data: el })) || []),
        ]) || [],
    )
  }, [project.acts])

  const scrollToElement = useCallback(
    (elementId: string) => {
      const itemIndex = flattenedScriptItems.findIndex((item) => item.data.id === elementId)
      if (itemIndex !== -1) {
        editorPaneRef.current?.scrollToIndex(itemIndex)
      }
    },
    [flattenedScriptItems],
  )

  useEffect(() => {
    if (elementToFocus) {
      scrollToElement(elementToFocus)
      const focusTimeout = setTimeout(() => {
        const element = elementRefs.current.get(elementToFocus)
        if (element) {
          element.focus()
          // Move cursor to the end of the content
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(element)
          range.collapse(false) // false collapses to the end
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
        setElementToFocus(null)
      }, 100)
      return () => clearTimeout(focusTimeout)
    }
  }, [elementToFocus, scrollToElement])


  const handleContentChange = useCallback(
    (id: string, content: string, isScene: boolean) => {
      debouncedSave(id, content, isScene)
    },
    [debouncedSave],
  )

  const handleFinalizeUpdate = useCallback(
    (id: string, content: string, isScene: boolean) => {
      debouncedSave.cancel()

      setProject((prevProject) => {
        const newActs = prevProject.acts.map((act) => ({
          ...act,
          scenes: act.scenes.map((scene) => {
            if (isScene && scene.id === id) {
              return { ...scene, setting: content }
            }
            return {
              ...scene,
              elements: scene.elements.map((el) => (el.id === id ? { ...el, content: content } : el)),
            }
          }),
        }))
        return { ...prevProject, acts: newActs }
      })

      if (id.startsWith("new-")) return
      if (isScene) {
        updateSceneSetting(id, content).catch((err) => console.error("Scene save failed on blur:", err))
      } else {
        updateScriptElementContent(id, content).catch((err) => console.error("Element save failed on blur:", err))
      }
    },
    [debouncedSave],
  )

  const handleFocus = useCallback((id: string, type: ToolbarScriptElementType | "SCENE_HEADING" | null) => {
    setActiveElementId(id)
    if (type && type !== "SCENE_HEADING") {
      setActiveElementType(type)
    } else {
      setActiveElementType(null)
    }
  }, [])

  const handleBlur = useCallback(() => {
    setActiveElementId(null)
    setActiveElementType(null)
  }, [])

  const handleInsertElement = useCallback(
    (type: ToolbarScriptElementType, targetElementId?: string, isTargetScene?: boolean) => {
      const idToInsertAfter = targetElementId || activeElementId
      let sceneId = ""
      let insertIndex = -1

      if (idToInsertAfter) {
        for (const act of project.acts) {
          for (const scene of act.scenes) {
            if (isTargetScene || scene.id === idToInsertAfter) {
              const isElement = scene.elements.some((el) => el.id === idToInsertAfter)
              if (!isElement) {
                sceneId = scene.id
                insertIndex = targetElementId ? 0 : scene.elements.length
                break
              }
            }
            const foundIndex = scene.elements.findIndex((el) => el.id === idToInsertAfter)
            if (foundIndex !== -1) {
              sceneId = scene.id
              insertIndex = foundIndex + 1
              break
            }
          }
          if (sceneId) break
        }
      }
      else if (allScenes.length > 0) {
        const lastScene = allScenes[allScenes.length - 1]
        sceneId = lastScene.id
        insertIndex = lastScene.elements.length
      }

      if (!sceneId) {
        console.warn("No location to insert new element.")
        return
      }

      const newElementData: Partial<ScriptElement> = {
        elementType: type,
        content: "",
        elementOrder: insertIndex + 1,
      }

      createElement(sceneId, newElementData)
        .then((createdElement) => {
          setProject((prevProject) => {
            const newActs = prevProject.acts.map((act) => ({
              ...act,
              scenes: act.scenes.map((scene) => {
                if (scene.id !== sceneId) return scene
                const newElements = [...(scene.elements || [])]
                newElements.splice(insertIndex, 0, createdElement)
                newElements.forEach((el, index) => (el.elementOrder = index + 1))
                return { ...scene, elements: newElements }
              }),
            }))
            return { ...prevProject, acts: newActs }
          })

          setElementToFocus(createdElement.id)
        })
        .catch((err) => console.error("Failed to create new element:", err))
    },
    [project.acts, activeElementId, allScenes],
  )

  const handleDeleteElement = useCallback(
    (elementIdToDelete: string) => {
      const originalProjectState = project;

      const deletedItemIndex = flattenedScriptItems.findIndex((item) => item.data.id === elementIdToDelete);
      if (deletedItemIndex > 0) {
        const previousElementId = flattenedScriptItems[deletedItemIndex - 1].data.id;
        setElementToFocus(previousElementId);
      }

      setProject((prevProject) => {
        const newActs = prevProject.acts.map((act) => ({
          ...act,
          scenes: act.scenes.map((scene) => ({
            ...scene,
            elements: scene.elements.filter((el) => el.id !== elementIdToDelete),
          })),
        }));
        return { ...prevProject, acts: newActs };
      });

      deleteScriptElement(elementIdToDelete).catch((err) => {
        console.error("Failed to delete element:", err);
        setProject(originalProjectState);
      });
    },
    [project, flattenedScriptItems],
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      elementId: string,
      isScene: boolean,
      elementType: ToolbarScriptElementType | "SCENE_HEADING",
    ) => {
      // --- ENTER KEY LOGIC ---
      if (e.key === "Enter" && !e.shiftKey) {
        // Default behavior for ACTION is to allow newlines, so we don't handle it here.
        // For SCENE_HEADING, we prevent newlines entirely.
        if (elementType === "ACTION") {
          return
        }
        e.preventDefault()
        if (isScene) return

        let nextElementType: ToolbarScriptElementType | null = null

        switch (elementType) {
          case "CHARACTER":
            nextElementType = "DIALOG"
            break
          case "DIALOG":
            nextElementType = "ACTION"
            break
          case "PARENTHETICAL":
            nextElementType = "DIALOG"
            break
          case "TRANSITION":
            nextElementType = "ACTION"
            break
        }

        if (nextElementType) {
          handleInsertElement(nextElementType, elementId, isScene)
        }
      }

      // --- BACKSPACE KEY LOGIC ---
      if (e.key === "Backspace" && !isScene) {
        const content = e.currentTarget.innerHTML
        if (content === "" || content === "<br>") {
          e.preventDefault()
          handleDeleteElement(elementId)
        }
      }
    },
    [handleInsertElement, handleDeleteElement],
  )

  const handleAddNewScene = useCallback(() => {
    console.log("Adding new scene...")
  }, [])

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
          <Toolbar
            onInsertElement={handleInsertElement}
            onAddNewScene={handleAddNewScene}
            activeElementType={activeElementType}
          />
          <EditorPane
            ref={editorPaneRef}
            items={flattenedScriptItems}
            elementRefs={elementRefs}
            onContentChange={handleContentChange}
            onFinalizeUpdate={handleFinalizeUpdate}
            onKeyDown={handleKeyDown}
            activeElementId={activeElementId}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>
      </div>
    </div>
  )
}
