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
import { ImportProjectDialog } from "../import-dialog"
import {
  createScene,
  createElement,
  updateElementContent,
  updateSceneHeading,
  addComment,
  updateComment,
  deleteComment,
  toggleCommentResolved,
  type FullProject,
  type Scene,
  type ScriptElement,
  type Comment
} from "@/services/project"
import { deleteScriptElement, updateScriptElement, deleteScene } from "@/services/editor"
import { getKeyString, createKeymap } from "@/lib/editor/keymap";
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { AIChatPanel } from "./AIChatPanel"
import { useAuth } from "@/lib/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type ScriptItem = { type: "SCENE_HEADING"; data: Scene } | { type: "ELEMENT"; data: ScriptElement }

interface ScreenplayEditorProps {
  projectData: FullProject
}


export function ScreenplayEditor({ projectData: initialProjectData }: ScreenplayEditorProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [project, setProject] = useState<FullProject>(initialProjectData)
  const [activeElementId, setActiveElementId] = useState<string | null>(null)
  const [activeElementType, setActiveElementType] = useState<ToolbarScriptElementType | "SCENE_HEADING" | null>(null)
  const [focusAtEndId, setFocusAtEndId] = useState<string | null>(null)
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const [isImportProjectDialogOpen, setIsImportProjectDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const elementRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const editorPaneRef = useRef<EditorPaneRef>(null)
  const sidePanelRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const refreshComments = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
  }, [])

  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasInitialFocused = useRef(false)

  const handleFocusHandled = useCallback(() => {
    setFocusAtEndId(null)
  }, [])

  const debouncedSave = useDebouncedCallback((id: string, content: string, isScene: boolean) => {
    if (id.startsWith("new-")) return
    if (!user?.id) return

    setIsSaving(true)
    if (isScene) {
      updateSceneHeading(id, user.id, content)
        .catch((err) => console.error("Scene save failed:", err))
        .finally(() => setIsSaving(false))
    } else {
      updateElementContent(id, user.id, content)
        .catch((err) => console.error("Element save failed:", err))
        .finally(() => setIsSaving(false))
    }
  }, 2000)

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

  // Helper function to focus an element and place cursor at end
  const focusElementAtEnd = useCallback((elementId: string, delay: number = 100) => {
    setTimeout(() => {
      const element = elementRefs.current.get(elementId)
      if (element) {
        element.focus()
        // Place cursor at end after focus
        requestAnimationFrame(() => {
          const selection = window.getSelection()
          if (selection && element) {
            const range = document.createRange()
            range.selectNodeContents(element)
            range.collapse(false) // false = collapse to end
            selection.removeAllRanges()
            selection.addRange(range)
          }
        })
      }
    }, delay)
  }, [])

  // Focus on last element when opening/refreshing the project
  useEffect(() => {
    if (!hasInitialFocused.current && flattenedScriptItems.length > 0) {
      hasInitialFocused.current = true
      const lastItem = flattenedScriptItems[flattenedScriptItems.length - 1]

      // First scroll to the element, then wait for it to render, then focus
      scrollToElement(lastItem.data.id)

      // Use a longer delay to ensure virtualized content has rendered
      setTimeout(() => {
        const element = elementRefs.current.get(lastItem.data.id)
        if (element) {
          element.focus()
          // Double requestAnimationFrame to ensure layout is complete
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const selection = window.getSelection()
              if (selection && element) {
                const range = document.createRange()
                range.selectNodeContents(element)
                range.collapse(false)
                selection.removeAllRanges()
                selection.addRange(range)
              }
            })
          })
        }
      }, 500)
    }
  }, [flattenedScriptItems, scrollToElement])

  const handleAddComment = useCallback(async (elementId: string, isScene: boolean, content: string) => {
    try {
      await addComment(
        project.id,
        project.id,
        content,
        0,
        isScene ? undefined : elementId,
        isScene ? elementId : undefined,
        undefined
      )

      refreshComments()
    } catch (err) {
      console.error("Failed to add comment:", err)
    }
  }, [project.id, refreshComments])

  const handleUpdateComment = useCallback(async (commentId: string, content: string) => {
    try {
      const updatedComment = await updateComment(commentId, content)

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
      await deleteComment(commentId)

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
        const updatedComment = await toggleCommentResolved(commentId, newResolvedState)

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
          const newScenes = prevProject.scenes?.map((scene) =>
            scene.id === id ? { ...scene, scene_heading: content } : scene
          ) || []
          return { ...prevProject, scenes: newScenes }
        } else {
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
    blurTimeoutRef.current = setTimeout(() => {
      if (sidePanelRef.current && sidePanelRef.current.contains(document.activeElement)) {
        return
      }
      // Don't clear if clicking on toolbar
      if (toolbarRef.current && toolbarRef.current.contains(document.activeElement)) {
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
        line_number: Math.max(insertIndex, 1)
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

          // Focus the new element at end (it's empty so cursor at start = end)
          scrollToElement(createdElement.id)
          focusElementAtEnd(createdElement.id, 100)
        })
        .catch((err) => {
          console.error("Failed to create new element:", err)
          toast({
            title: "Error",
            description: "Failed to create new element. Please try again.",
            variant: "destructive",
          })
        })
    },
    [project.scenes, activeElementId, allScenes, project.id, user?.id, toast, scrollToElement, focusElementAtEnd],
  )

  // Transform the currently active element to a different type (including scene ↔ element)
  const handleTransformElement = useCallback(
    (newType: ToolbarScriptElementType | "SCENE_HEADING") => {
      if (!activeElementId || !user?.id || !project.id) return

      // Find what we're transforming - could be an element or a scene
      let elementToTransform: ScriptElement | null = null
      let sceneToTransform: Scene | null = null
      let parentSceneId: string | null = null
      let elementIndex = 0

      for (const scene of project.scenes || []) {
        // Check if active is this scene
        if (scene.id === activeElementId) {
          sceneToTransform = scene
          break
        }
        // Check if active is an element in this scene
        const foundIndex = scene.elements?.findIndex((el) => el.id === activeElementId) ?? -1
        if (foundIndex !== -1) {
          elementToTransform = scene.elements![foundIndex]
          parentSceneId = scene.id
          elementIndex = foundIndex
          break
        }
      }

      // Case 1: Transform Element → Scene
      if (elementToTransform && newType === "SCENE_HEADING") {
        const content = elementToTransform.content

        // Create new scene with the element's content as heading
        const sceneIndex = project.scenes?.findIndex(s => s.id === parentSceneId) ?? 0
        const newSceneData = {
          scene_heading: content,
          content: "",
          order_index: sceneIndex + 1
        }

        createScene(project.id, user.id, newSceneData)
          .then((createdScene) => {
            // Delete the original element and add the new scene
            setProject((prevProject) => {
              const newScenes = prevProject.scenes?.map((scene) => {
                if (scene.id !== parentSceneId) return scene
                return {
                  ...scene,
                  elements: scene.elements?.filter((el) => el.id !== activeElementId)
                }
              }) || []

              // Insert the new scene after the parent scene
              const insertIndex = newScenes.findIndex(s => s.id === parentSceneId) + 1
              newScenes.splice(insertIndex, 0, createdScene)

              return { ...prevProject, scenes: newScenes }
            })

            // Delete the element from backend
            deleteScriptElement(activeElementId).catch(console.error)

            // Focus the new scene
            scrollToElement(createdScene.id)
            focusElementAtEnd(createdScene.id, 100)
            setActiveElementType("SCENE_HEADING")
          })
          .catch((err) => {
            console.error("Failed to create scene from element:", err)
            toast({
              title: "Error",
              description: "Failed to transform to scene. Please try again.",
              variant: "destructive",
            })
          })
        return
      }

      // Case 2: Transform Scene → Element
      if (sceneToTransform && newType !== "SCENE_HEADING") {
        const content = sceneToTransform.scene_heading

        // Find the previous scene to add element to, or use the first scene
        const sceneIndex = project.scenes?.findIndex(s => s.id === activeElementId) ?? 0
        const targetSceneId = sceneIndex > 0 
          ? project.scenes![sceneIndex - 1].id 
          : (project.scenes && project.scenes.length > 1 ? project.scenes[1].id : null)

        if (!targetSceneId) {
          toast({
            title: "Cannot transform",
            description: "Need at least one other scene to transform this scene to an element.",
            variant: "destructive",
          })
          return
        }

        // Get the target scene to find insert position
        const targetScene = project.scenes?.find(s => s.id === targetSceneId)
        const insertIndex = targetScene?.elements?.length || 0

        const newElementData = {
          scene_id: targetSceneId,
          element_type: newType as ToolbarScriptElementType,
          content: content,
          line_number: Math.max(insertIndex, 1)
        }

        createElement(project.id, user.id, newElementData)
          .then((createdElement) => {
            // Delete the scene and add the new element
            setProject((prevProject) => {
              const newScenes = prevProject.scenes
                ?.filter((scene) => scene.id !== activeElementId)
                ?.map((scene) => {
                  if (scene.id !== targetSceneId) return scene
                  return {
                    ...scene,
                    elements: [...(scene.elements || []), createdElement]
                  }
                }) || []

              return { ...prevProject, scenes: newScenes }
            })

            // Scene deletion is handled by removing from local state
            // The backend may need a delete scene call if it persists
            // For now, assuming scene is removed when elements are reassigned

            // Focus the new element
            scrollToElement(createdElement.id)
            focusElementAtEnd(createdElement.id, 100)
            setActiveElementType(newType as ToolbarScriptElementType)
          })
          .catch((err) => {
            console.error("Failed to create element from scene:", err)
            toast({
              title: "Error",
              description: "Failed to transform scene. Please try again.",
              variant: "destructive",
            })
          })
        return
      }

      // Case 3: Transform Element → Element (same type check)
      if (elementToTransform) {
        if (elementToTransform.element_type === newType) return

        // Optimistically update local state
        setProject((prevProject) => {
          const newScenes = prevProject.scenes?.map((scene) => ({
            ...scene,
            elements: scene.elements?.map((el) =>
              el.id === activeElementId ? { ...el, element_type: newType as ToolbarScriptElementType } : el
            ),
          }))
          return { ...prevProject, scenes: newScenes }
        })

        // Update the active element type for toolbar highlight
        setActiveElementType(newType as ToolbarScriptElementType)

        // Persist to backend
        updateScriptElement(activeElementId, {
          user_id: user.id,
          elementType: newType as ToolbarScriptElementType,
        }).catch((err) => {
          console.error("Failed to transform element:", err)
          // Revert on error
          setProject((prevProject) => {
            const newScenes = prevProject.scenes?.map((scene) => ({
              ...scene,
              elements: scene.elements?.map((el) =>
                el.id === activeElementId ? { ...el, element_type: elementToTransform!.element_type } : el
              ),
            }))
            return { ...prevProject, scenes: newScenes }
          })
          setActiveElementType(elementToTransform!.element_type)
          toast({
            title: "Error",
            description: "Failed to transform element. Please try again.",
            variant: "destructive",
          })
        })
      }
    },
    [activeElementId, project.id, project.scenes, user?.id, toast, scrollToElement, focusElementAtEnd],
  )

  const handleDeleteElement = useCallback(
    (elementIdToDelete: string) => {
      const originalProjectState = project

      const deletedItemIndex = flattenedScriptItems.findIndex((item) => item.data.id === elementIdToDelete)
      if (deletedItemIndex > 0) {
        const previousElementId = flattenedScriptItems[deletedItemIndex - 1].data.id
        scrollToElement(previousElementId)
        focusElementAtEnd(previousElementId, 50)
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
    [project, flattenedScriptItems, scrollToElement, focusElementAtEnd],
  )

  const handleDeleteScene = useCallback(
    (sceneIdToDelete: string) => {
      const originalProjectState = project

      const deletedItemIndex = flattenedScriptItems.findIndex((item) => item.data.id === sceneIdToDelete)
      if (deletedItemIndex > 0) {
        const previousElementId = flattenedScriptItems[deletedItemIndex - 1].data.id
        scrollToElement(previousElementId)
        focusElementAtEnd(previousElementId, 50)
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
    [project, flattenedScriptItems, scrollToElement, focusElementAtEnd],
  )

  const handleSelectAll = useCallback(async (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const textElements = Array.from(
      document.querySelectorAll('[data-screenplay-text]')
    ) as HTMLElement[];

    if (textElements.length === 0) return;

    const screenplay = textElements
      .map(el => el.textContent || '')
      .join('\n');

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(screenplay);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = screenplay;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          document.execCommand('copy');
        } finally {
          textArea.remove();
        }
      }

      toast({
        title: "Copied to clipboard",
        description: `${textElements.length} screenplay elements copied successfully.`,
      });

      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();

        textElements.forEach(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.addRange(range);
        });

        setTimeout(() => {
          selection.removeAllRanges();
        }, 150);
      }
    } catch (err) {
      console.error('Failed to copy screenplay:', err);
      toast({
        title: "Copy failed",
        description: "Could not copy screenplay to clipboard.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleChangeElementType = useCallback(
    (elementId: string, newType: ToolbarScriptElementType, currentContent: string) => {
      const originalProjectState = project;

      if (!user?.id) {
        console.error("Cannot change element type: No user ID available.");
        return;
      }

      // Update local state optimistically
      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject;

        const newScenes = prevProject.scenes.map((scene: Scene) => ({
          ...scene,
          elements: scene.elements?.map((el: ScriptElement) =>
            el.id === elementId ? { ...el, element_type: newType, content: currentContent } : el
          ),
        }));

        return { ...prevProject, scenes: newScenes };
      });

      // Update on server - include both type and content
      updateScriptElement(elementId, {
        user_id: user.id,
        elementType: newType,
        content: currentContent
      })
        .catch((err) => {
          console.error("Failed to change element type:", err);
          setProject(originalProjectState);
          toast({
            title: "Error",
            description: "Failed to change element type.",
            variant: "destructive",
          });
        });
    },
    [project, user?.id, toast]
  );

  // Navigate to previous element (for arrow up at start of element)
  const handleNavigateToPrevious = useCallback(
    (currentElementId: string) => {
      const currentIndex = flattenedScriptItems.findIndex((item) => item.data.id === currentElementId);
      if (currentIndex > 0) {
        const previousElementId = flattenedScriptItems[currentIndex - 1].data.id;
        scrollToElement(previousElementId);
        focusElementAtEnd(previousElementId, 0);
      }
    },
    [flattenedScriptItems, scrollToElement, focusElementAtEnd]
  );

  // Navigate to next element (for arrow down at end of element)
  const handleNavigateToNext = useCallback(
    (currentElementId: string) => {
      const currentIndex = flattenedScriptItems.findIndex((item) => item.data.id === currentElementId);
      if (currentIndex < flattenedScriptItems.length - 1) {
        const nextElementId = flattenedScriptItems[currentIndex + 1].data.id;
        // Focus at start for down arrow
        const nextElement = elementRefs.current.get(nextElementId);
        if (nextElement) {
          nextElement.focus();
          // Place cursor at start
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.selectNodeContents(nextElement);
            range.collapse(true); // true = collapse to start
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
        scrollToElement(nextElementId);
      }
    },
    [flattenedScriptItems, scrollToElement]
  );

  const handleAddNewScene = useCallback(() => {
    if (!project.id || !user?.id) {
      console.error("Cannot add a scene: No project ID or user ID available.")
      return
    }

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

        // Focus the new scene at end (it's empty so cursor at start = end)
        scrollToElement(createdScene.id)
        focusElementAtEnd(createdScene.id, 100)
      })
      .catch((err) => {
        console.error("Failed to create new scene:", err)
      })
  }, [project.id, project.scenes, user?.id, scrollToElement, focusElementAtEnd])

  const keyMap = useMemo(() => createKeymap({
    handleFinalizeUpdate,
    handleInsertElement,
    handleDeleteScene,
    handleDeleteElement,
    handleSelectAll,
    handleChangeElementType,
    handleNavigateToPrevious,
    handleNavigateToNext,
    handleAddNewScene,
  }), [
    handleFinalizeUpdate,
    handleInsertElement,
    handleDeleteScene,
    handleDeleteElement,
    handleSelectAll,
    handleChangeElementType,
    handleNavigateToPrevious,
    handleNavigateToNext,
    handleAddNewScene,
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

  const toggleAIChat = useCallback(() => {
    setIsAIChatOpen((prev) => !prev)
  }, [])

  const handleProjectImported = () => {
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

        <div className={cn("flex-1 flex flex-col overflow-hidden", isAIChatOpen && "border-r border-border/40")}>
          <Toolbar
            ref={toolbarRef}
            onInsertElement={handleInsertElement}
            onTransformElement={handleTransformElement}
            onAddNewScene={handleAddNewScene}
            activeElementType={activeElementType}
            hasActiveElement={activeElementId !== null}
          />
          <EditorPane
            ref={editorPaneRef}
            items={flattenedScriptItems}
            scenes={allScenes}
            elementRefs={elementRefs}
            onContentChange={handleContentChange}
            onFinalizeUpdate={handleFinalizeUpdate}
            onKeyDown={handleKeyDown}
            activeElementId={activeElementId}
            onFocus={handleFocus}
            onBlur={handleBlur}
            focusAtEndId={focusAtEndId}
            onFocusHandled={handleFocusHandled}
            onAddNewScene={handleAddNewScene}
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

      <ImportProjectDialog
        open={isImportProjectDialogOpen}
        onOpenChange={setIsImportProjectDialogOpen}
        onProjectImported={handleProjectImported}
      />

      {/* Saving indicator */}
      {isSaving && (
        <div className="fixed bottom-4 right-4 bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg px-4 py-2 flex items-center gap-2 z-50">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
          <span className="text-sm text-muted-foreground">Saving...</span>
        </div>
      )}
    </div>
  )
}
