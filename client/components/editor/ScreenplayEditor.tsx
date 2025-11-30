"use client"

import type React from "react"
import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import Link from "next/link"
import { Download, FileText, ArrowLeft, Bot, FilePlus2Icon, BarChart3 } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { Button } from "@/components/ui/button"
import { Toolbar } from "./Toolbar"
import { SidePanel } from "./SidePanel"
import { EditorPane, type EditorPaneRef } from "./EditorPane"
import { ImportProjectDialog } from "../import-dialog" // Already imported
import {
  createScene,
  createElement,
  updateElementContent,
  updateSceneHeading,
  getProjectScenes,
  getProjectScriptElements,
  addComment,
  updateComment,
  deleteComment,
  toggleCommentResolved,
  type FullProject,
  type Scene,
  type ScriptElement,
  type Project,
  type Comment // Added Comment type for the handler
} from "@/services/project"
import { getKeyString, createKeymap } from "@/lib/editor/keymap";
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { AIChatPanel } from "./AIChatPanel"
import { useAuth } from "@/lib/AuthContext"

type ScriptItem = { type: "SCENE_HEADING"; data: Scene } | { type: "ELEMENT"; data: ScriptElement }

interface ScreenplayEditorProps {
  projectData: FullProject
}

// Placeholder functions for features not yet implemented in microservices
const updateSceneSetting = async (sceneId: string, content: string) => {
  console.warn('updateSceneSetting not yet implemented in microservices')
  // TODO: Implement scene update endpoint
}

const updateScriptElementContent = async (elementId: string, content: string) => {
  console.warn('updateScriptElementContent not yet implemented in microservices')
  // TODO: Implement script element update endpoint
}

const deleteScriptElement = async (elementId: string) => {
  console.warn('deleteScriptElement not yet implemented in microservices')
  // TODO: Implement script element delete endpoint
}

const deleteScene = async (sceneId: string) => {
  console.warn('deleteScene not yet implemented in microservices')
  // TODO: Implement scene delete endpoint
}

// Comment functions are now imported from services/project

export function ScreenplayEditor({ projectData: initialProjectData }: ScreenplayEditorProps) {
  const { user } = useAuth()
  const [project, setProject] = useState<FullProject>(initialProjectData)
  const [activeElementId, setActiveElementId] = useState<string | null>(null)
  const [activeElementType, setActiveElementType] = useState<ToolbarScriptElementType | null>(null)
  const [elementToFocus, setElementToFocus] = useState<string | null>(null)
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const [isImportProjectDialogOpen, setIsImportProjectDialogOpen] = useState(false) // New state for import dialog
  const elementRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const editorPaneRef = useRef<EditorPaneRef>(null)
  const sidePanelRef = useRef<HTMLDivElement>(null)

  // Function to refresh comments after adding one
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const refreshComments = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
  }, [])

  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)




  const debouncedSave = useDebouncedCallback((id: string, content: string, isScene: boolean) => {
    if (id.startsWith("new-")) return
    console.log("Saving to database...")
    if (isScene) {
      updateSceneSetting(id, content).catch((err) => console.error("Scene save failed:", err))
    } else {
      updateScriptElementContent(id, content).catch((err) => console.error("Element save failed:", err))
    }
  }, 1500)

  const allScenes = useMemo(() => project?.scenes || [], [project.scenes])
  const totalScenes = allScenes.length
  const totalElements = useMemo(
    () => allScenes.reduce((acc, scene) => acc + (scene.elements?.length || 0), 0),
    [allScenes],
  )

  const flattenedScriptItems: ScriptItem[] = useMemo(() => {
    if (!project?.scenes?.length) return []
    
    return project.scenes.flatMap((scene) => [
      { type: "SCENE_HEADING", data: scene },
      ...(scene.elements?.map((el): ScriptItem => ({ type: "ELEMENT", data: el })) || []),
    ])
  }, [project.scenes])

  const scrollToElement = useCallback(
    (elementId: string) => {
      const itemIndex = flattenedScriptItems.findIndex((item) => item.data.id === elementId)
      if (itemIndex !== -1) {
        editorPaneRef.current?.scrollToIndex(itemIndex)
      }
    },
    [flattenedScriptItems],
  )

  const handleAddComment = useCallback(async (elementId: string, isScene: boolean, content: string) => {
    try {
      // Call the actual API to save the comment
      await addComment(
        project.id, // project ID
        project.id, // Use project ID as screenplay ID for now
        content,
        0, // line number - would need to be calculated based on element position
        isScene ? undefined : elementId, // script element ID only if it's not a scene
        isScene ? elementId : undefined, // scene ID only if it's a scene
        undefined // parent ID for replies
      )
      
      // Trigger refresh of comments in SidePanel
      refreshComments()
    } catch (err) {
      console.error("Failed to add comment:", err)
    }
  }, [project.id, refreshComments])

  const handleUpdateComment = useCallback(async (commentId: string, content: string) => {
    try {
      // Call the actual API to update the comment
      const updatedComment = await updateComment(commentId, content)
      
      // Update local state with the updated comment
      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject
        
        const newScenes = prevProject.scenes.map((scene: Scene) => ({
          ...scene,
          comments: (scene as any).comments?.map((c: Comment) => (c.id === commentId ? updatedComment : c)),
          elements: scene.elements?.map((el: ScriptElement) => ({
            ...el,
            comments: (el as any).comments?.map((c: Comment) => (c.id === commentId ? updatedComment : c)),
          })),
        }))
        
        return { ...prevProject, scenes: newScenes }
      })
    } catch (err) {
      console.error("Failed to update comment:", err)
    }
  }, [])

  const handleDeleteComment = useCallback(async (commentId: string) => {
    try {
      // Call the actual API to delete the comment
      await deleteComment(commentId)
      
      // Update local state to remove the comment
      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject
        
        const newScenes = prevProject.scenes.map((scene: Scene) => ({
          ...scene,
          comments: (scene as any).comments?.filter((c: Comment) => c.id !== commentId),
          elements: scene.elements?.map((el: ScriptElement) => ({
            ...el,
            comments: (el as any).comments?.filter((c: Comment) => c.id !== commentId),
          })),
        }))
        
        return { ...prevProject, scenes: newScenes }
      })
    } catch (err) {
      console.error("Failed to delete comment:", err)
    }
  }, [])


  const handleToggleCommentResolved = useCallback(
    async (elementId: string, commentId: string, isScene: boolean, newResolvedState: boolean) => {
      const originalProject = JSON.parse(JSON.stringify(project))

      try {
        // Call the actual API to toggle the comment resolved state
        const updatedComment = await toggleCommentResolved(commentId, newResolvedState)
        
        // Update local state with the updated comment
        setProject((prevProject) => {
          if (!prevProject.scenes) return prevProject
          
          const newScenes = prevProject.scenes.map((scene: Scene) => {
            if (isScene && scene.id === elementId) {
              return {
                ...scene,
                comments: (scene as any).comments?.map((c: Comment) =>
                  c.id === commentId ? updatedComment : c,
                ),
              }
            }
            return {
              ...scene,
              elements: scene.elements?.map((el: ScriptElement) =>
                el.id === elementId
                  ? {
                    ...el,
                    comments: (el as any).comments?.map((c: Comment) =>
                      c.id === commentId ? updatedComment : c,
                    ),
                  }
                  : el,
              ),
            }
          })
          
          return { ...prevProject, scenes: newScenes }
        })
      } catch (err) {
        console.error("Failed to toggle comment resolved status:", err)
        setProject(originalProject)
      }
    },
    [project],
  )

  useEffect(() => {
    if (elementToFocus) {
      scrollToElement(elementToFocus)
      const focusTimeout = setTimeout(() => {
        const element = elementRefs.current.get(elementToFocus)
        if (element) {
          element.focus()
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(element)
          range.collapse(false)
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
        if (isScene) {
          // Update scene in flat scenes array
          const newScenes = prevProject.scenes?.map((scene) => 
            scene.id === id ? { ...scene, scene_heading: content } : scene
          ) || []
          return { ...prevProject, scenes: newScenes }
        } else {
          // Update element within scenes
          const newScenes = prevProject.scenes?.map((scene) => ({
            ...scene,
            elements: scene.elements?.map((el) => (el.id === id ? { ...el, content: content } : el)),
          })) || []
          return { ...prevProject, scenes: newScenes }
        }
      })

      if (id.startsWith("new-")) return
      if (isScene) {
        if (!user?.id) {
          console.error("Cannot update scene: No user ID available.")
          return
        }
        updateSceneHeading(id, user.id, content).catch((err) => console.error("Scene save failed on blur:", err))
      } else {
        if (!user?.id) {
          console.error("Cannot update element: No user ID available.")
          return
        }
        updateElementContent(id, user.id, content).catch((err) => console.error("Element save failed on blur:", err))
      }
    },
    [debouncedSave],
  )

  const handleFocus = useCallback((id: string, type: ToolbarScriptElementType | "SCENE_HEADING" | null) => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
    setActiveElementId(id)
    if (type && type !== "SCENE_HEADING") {
      setActiveElementType(type)
    } else {
      setActiveElementType(null)
    }
  }, [])

  const handleBlur = useCallback(() => {
    // Set a timeout to check the active element after a short delay
    blurTimeoutRef.current = setTimeout(() => {
      if (sidePanelRef.current && sidePanelRef.current.contains(document.activeElement)) {
        // If the new active element is within the side panel, do nothing
        return
      }
      setActiveElementId(null)
      setActiveElementType(null)
    }, 50)
  }, [])

  const handleInsertElement = useCallback(
    (type: ToolbarScriptElementType, targetElementId?: string, isTargetScene?: boolean) => {
      const idToInsertAfter = targetElementId || activeElementId
      let sceneId = ""
      let insertIndex = -1

      if (idToInsertAfter && project.scenes) {
        for (const scene of project.scenes) {
          if (isTargetScene && scene.id === idToInsertAfter) {
            sceneId = scene.id
            insertIndex = 0
            break
          }

          const foundIndex = scene.elements?.findIndex((el) => el.id === idToInsertAfter) ?? -1
          if (foundIndex !== -1) {
            sceneId = scene.id
            insertIndex = foundIndex + 1
            break
          }
        }
      } else if (allScenes.length > 0) {
        const lastScene = allScenes[allScenes.length - 1]
        sceneId = lastScene.id
        insertIndex = lastScene.elements?.length || 0
      }

      if (!sceneId) {
        console.warn("No location to insert new element.")
        return
      }

      if (!project.id || !user?.id) {
        console.error("Cannot add element: No project ID or user ID available.")
        return
      }

      if (!sceneId) {
        console.error("Cannot add element: Scene ID is required.")
        return
      }

      const newElementData = {
        scene_id: sceneId,
        element_type: type,
        content: "",
        line_number: Math.max(insertIndex, 1) // Ensure line number is at least 1
      }

      createElement(project.id, user.id, newElementData)
        .then((createdElement) => {
          setProject((prevProject) => {
            const newScenes = prevProject.scenes?.map((scene) => {
              if (scene.id !== sceneId) return scene
              const newElements = [...(scene.elements || [])]
              newElements.splice(insertIndex, 0, createdElement)
              return { ...scene, elements: newElements }
            }) || []
            return { ...prevProject, scenes: newScenes }
          })

          setElementToFocus(createdElement.id)
        })
        .catch((err) => console.error("Failed to create new element:", err))
    },
    [project.scenes, activeElementId, allScenes],
  )

  const handleDeleteElement = useCallback(
    (elementIdToDelete: string) => {
      const originalProjectState = project

      const deletedItemIndex = flattenedScriptItems.findIndex((item) => item.data.id === elementIdToDelete)
      if (deletedItemIndex > 0) {
        const previousElementId = flattenedScriptItems[deletedItemIndex - 1].data.id
        setElementToFocus(previousElementId)
      }

      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject
        
        const newScenes = prevProject.scenes.map((scene: Scene) => ({
          ...scene,
          elements: scene.elements?.filter((el: ScriptElement) => el.id !== elementIdToDelete),
        }))
        
        return { ...prevProject, scenes: newScenes }
      })

      deleteScriptElement(elementIdToDelete).catch((err) => {
        console.error("Failed to delete element:", err)
        setProject(originalProjectState)
      })
    },
    [project, flattenedScriptItems],
  )

  const handleDeleteScene = useCallback(
    (sceneIdToDelete: string) => {
      const originalProjectState = project

      const deletedItemIndex = flattenedScriptItems.findIndex((item) => item.data.id === sceneIdToDelete)
      if (deletedItemIndex > 0) {
        const previousElementId = flattenedScriptItems[deletedItemIndex - 1].data.id
        setElementToFocus(previousElementId)
      }

      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject
        
        const newScenes = prevProject.scenes.filter((scene: Scene) => scene.id !== sceneIdToDelete)
        
        return { ...prevProject, scenes: newScenes }
      })

      deleteScene(sceneIdToDelete).catch((err) => {
        console.error("Failed to delete scene:", err)
        setProject(originalProjectState)
      })
    },
    [project, flattenedScriptItems],
  )

  const handleSelectAll = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const scriptContainer = editorPaneRef.current?.getScriptContainer();

    if (scriptContainer && window.getSelection) {
      const selection = window.getSelection();
      const range = document.createRange();
      // Select all the content within the script container div
      range.selectNodeContents(scriptContainer);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, []);


  const keyMap = useMemo(() => createKeymap({
    handleFinalizeUpdate,
    handleInsertElement,
    handleDeleteScene,
    handleDeleteElement,
    handleSelectAll,
  }), [
    handleFinalizeUpdate,
    handleInsertElement,
    handleDeleteScene,
    handleDeleteElement,
    handleSelectAll,
  ]);

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      elementId: string,
      isScene: boolean,
      elementType: ToolbarScriptElementType | "SCENE_HEADING",
    ) => {
      const keyString = getKeyString(e);

      const handler = keyMap[keyString as keyof typeof keyMap];
      if (handler) {
        handler(e, elementId, isScene, elementType);
      }
    },
    [keyMap],
  );

  const handleAddNewScene = useCallback(() => {
    if (!project.id || !user?.id) {
      console.error("Cannot add a scene: No project ID or user ID available.")
      return
    }

    // Create scene data for microservices structure
    const newSceneData = {
      scene_heading: "",
      content: "",
      order_index: project.scenes?.length || 0
    }

    createScene(project.id, user.id, newSceneData)
      .then((createdScene) => {
        setProject((prevProject) => ({
          ...prevProject,
          scenes: [...(prevProject.scenes || []), createdScene]
        }))

        setElementToFocus(createdScene.id)
      })
      .catch((err) => {
        console.error("Failed to create new scene:", err)
      })
  }, [project.id, project.scenes, user?.id])

  const toggleAIChat = useCallback(() => {
    setIsAIChatOpen((prev) => !prev)
  }, [])

  // Handler for successful project import (though the dialog handles navigation)
  const handleProjectImported = (importedProject: Project) => {
    console.log(`Successfully imported project: ${importedProject.title}`);
    // The dialog should handle routing, but this ensures the state is closed
    setIsImportProjectDialogOpen(false);
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
            <h1 className="text-lg font-medium">{project.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2 bg-transparent" onClick={toggleAIChat}>
              <Bot className="h-4 w-4" />
              Writing Buddy
            </Button>
            <Link href={`/dashboard/projects/${project.id}/analytics`}>
              <Button variant="outline" className="gap-2 bg-transparent">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Button>
            </Link>
            <Button variant="outline" className="gap-2 bg-transparent">
              <Download className="h-4 w-4" />
              Export
            </Button>
            {/* Connect the Import button to open the dialog */}
            <Button variant="outline" className="gap-2 bg-transparent" onClick={() => setIsImportProjectDialogOpen(true)}>
              <FilePlus2Icon className="h-4 w-4" />
              Import
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SidePanel
          key={refreshTrigger}
          ref={sidePanelRef}
          project={project}
          allScenes={allScenes}
          totalScenes={totalScenes}
          totalElements={totalElements}
          onScrollToElement={scrollToElement}
          activeElementId={activeElementId}
          onAddComment={handleAddComment}
          onUpdateComment={handleUpdateComment}
          onDeleteComment={handleDeleteComment}
          onToggleCommentResolved={handleToggleCommentResolved}
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
        <AIChatPanel
          isOpen={isAIChatOpen}
          onClose={() => setIsAIChatOpen(false)}
          currentScene={
            activeElementId
              ? allScenes.find(
                (scene) => scene.id === activeElementId || scene.elements?.some((el) => el.id === activeElementId),
              )?.scene_heading
              : undefined
          }
          currentElement={activeElementId || undefined}
        />
      </div>

      {/* Render the Import Dialog */}
      <ImportProjectDialog
        open={isImportProjectDialogOpen}
        onOpenChange={setIsImportProjectDialogOpen}
        onProjectImported={handleProjectImported}
      />
    </div>
  )
}
