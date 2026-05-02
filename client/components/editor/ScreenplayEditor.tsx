"use client"

import type React from "react"
import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import Link from "next/link"
import { Download, FileText, ArrowLeft, Bot, FilePlus2Icon, BarChart3, ChevronDown } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { Button } from "@/components/ui/button"
import { Toolbar } from "./Toolbar"
import { SidePanel } from "./SidePanel"
import { EditorPane, type EditorPaneRef } from "./EditorPane"
import { ImportProjectDialog } from "../import-dialog"
import {
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
import { dispatchKey } from "@/lib/editor/keymap";
import { createScreenplayKeymap } from "./screenplay/keymap";
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { AIChatPanel } from "./AIChatPanel"
import { useScreenplayElements } from "./screenplay/useScreenplayElements"
import { useAuth } from "@/lib/AuthContext"
import { exportScreenplayToPDF } from "@/lib/export/screenplay-pdf"
import { exportScreenplayToFDX } from "@/lib/export/screenplay-fdx"
import { useExportToast } from "@/lib/export/use-export-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type ScriptItem = { type: "SCENE_HEADING"; data: Scene } | { type: "ELEMENT"; data: ScriptElement }

interface ScreenplayEditorProps {
  projectData: FullProject
}


export function ScreenplayEditor({ projectData: initialProjectData }: ScreenplayEditorProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const runExport = useExportToast()
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
      const createdComment = await addComment(
        project.id,
        project.id,
        content,
        0,
        isScene ? undefined : elementId,
        isScene ? elementId : undefined,
        undefined
      )

      // Attach the new comment to the matching element / scene in project state
      // so EditableElement's "unresolvedCommentsCount" badge appears immediately.
      // Without this the inline indicator would only surface on next full reload.
      const commentForState: Comment = {
        ...createdComment,
        elementId,
        isScene,
      }
      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject
        const newScenes = prevProject.scenes.map((scene: Scene) => {
          if (isScene && scene.id === elementId) {
            return { ...scene, comments: [...(scene.comments ?? []), commentForState] }
          }
          if (!isScene && scene.elements?.some((el: ScriptElement) => el.id === elementId)) {
            return {
              ...scene,
              elements: scene.elements.map((el: ScriptElement) =>
                el.id === elementId
                  ? { ...el, comments: [...(el.comments ?? []), commentForState] }
                  : el,
              ),
            }
          }
          return scene
        })
        return { ...prevProject, scenes: newScenes }
      })

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
          comments: scene.comments?.map((c: Comment) => (c.id === commentId ? updatedComment : c)),
          elements: scene.elements?.map((el: ScriptElement) => ({
            ...el,
            comments: el.comments?.map((c: Comment) => (c.id === commentId ? updatedComment : c)),
          })),
        }))

        return { ...prevProject, scenes: newScenes }
      })

      // SidePanel keeps an independent `allComments` list sourced from
      // getComments(project.id); bump the refresh trigger so it re-reads with
      // the updated content. Without this the user's edit doesn't appear in
      // the CommentPanel even though the backend saved it.
      refreshComments()
    } catch (err) {
      console.error("Failed to update comment:", err)
    }
  }, [refreshComments])

  const handleDeleteComment = useCallback(async (commentId: string) => {
    try {
      await deleteComment(commentId)

      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject

        const newScenes = prevProject.scenes.map((scene: Scene) => ({
          ...scene,
          comments: scene.comments?.filter((c: Comment) => c.id !== commentId),
          elements: scene.elements?.map((el: ScriptElement) => ({
            ...el,
            comments: el.comments?.filter((c: Comment) => c.id !== commentId),
          })),
        }))

        return { ...prevProject, scenes: newScenes }
      })

      refreshComments()
    } catch (err) {
      console.error("Failed to delete comment:", err)
    }
  }, [refreshComments])


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
                comments: scene.comments?.map((c: Comment) =>
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
                    comments: el.comments?.map((c: Comment) =>
                      c.id === commentId ? updatedComment : c,
                    ),
                  }
                  : el,
              ),
            }
          })

          return { ...prevProject, scenes: newScenes }
        })

        // Force SidePanel to reload allComments so the resolve state change
        // is visible in the CommentPanel and the tab badge counter.
        refreshComments()
      } catch (err) {
        console.error("Failed to toggle comment resolved status:", err)
        setProject(originalProject)
      }
    },
    [project, refreshComments],
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

      if (id.startsWith("new-")) return
      if (!user?.id) return

      // Sync the finalised content into React state so the sidebar (scene list,
      // structure tab) reflects what the user actually typed. We only do this on
      // blur, not on every keystroke — contentEditable owns keystroke-level state
      // to avoid a re-render cascade across all elements while typing.
      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject
        const newScenes = prevProject.scenes.map((scene: Scene) => {
          if (isScene && scene.id === id) {
            return { ...scene, scene_heading: content }
          }
          if (!isScene && scene.elements?.some((el: ScriptElement) => el.id === id)) {
            return {
              ...scene,
              elements: scene.elements.map((el: ScriptElement) =>
                el.id === id ? { ...el, content } : el,
              ),
            }
          }
          return scene
        })
        return { ...prevProject, scenes: newScenes }
      })

      if (isScene) {
        updateSceneHeading(id, user.id, content).catch((err) => console.error("Scene save failed on blur:", err))
      } else {
        updateElementContent(id, user.id, content).catch((err) => console.error("Element save failed on blur:", err))
      }
    },
    [debouncedSave, user?.id],
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

  const {
    handleInsertElement,
    handleTransformElement,
    handleDeleteElement,
    handleDeleteScene,
    handleSelectAll,
    handleChangeElementType,
    handleNavigateToPrevious,
    handleNavigateToNext,
    handleAddNewScene,
  } = useScreenplayElements({
    project,
    setProject,
    activeElementId,
    setActiveElementType,
    flattenedScriptItems,
    allScenes,
    elementRefs,
    scrollToElement,
    focusElementAtEnd,
    userId: user?.id,
    toast,
  })

  const keyMap = useMemo(() => createScreenplayKeymap({
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
      dispatchKey(e, keyMap, { elementId, isScene, elementType });
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
          <div className="flex items-center gap-3">
            {/* Save status — inline replacement for the floating chip
                we used to render bottom-right. Reads as a quiet status
                line, lives where every other editor's status lives, and
                announces transitions to assistive tech via aria-live. */}
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="text-xs text-muted-foreground"
            >
              {isSaving ? "Saving…" : ""}
            </span>
            <Button variant="outline" className="gap-2 bg-transparent" onClick={toggleAIChat}>
              <Bot className="h-4 w-4" />
              Writing Buddy
            </Button>
            <Link href={`/analytics?project=${project.id}`}>
              <Button variant="outline" className="gap-2 bg-transparent">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 bg-transparent">
                  <Download className="h-4 w-4" />
                  Export
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void runExport({
                  extension: "pdf",
                  projectTitle: project.title,
                  run: () => exportScreenplayToPDF(project),
                })}>
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runExport({
                  extension: "fdx",
                  projectTitle: project.title,
                  run: () => exportScreenplayToFDX(project),
                })}>
                  Export as FDX (Final Draft)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" className="gap-2 bg-transparent" onClick={() => setIsImportProjectDialogOpen(true)}>
              <FilePlus2Icon className="h-4 w-4" />
              Import
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SidePanel
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
          refreshTrigger={refreshTrigger}
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
          category={project.category}
          projectId={project.id}
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

    </div>
  )
}
