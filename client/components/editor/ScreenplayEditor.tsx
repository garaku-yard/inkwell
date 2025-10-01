"use client"

import type React from "react"
import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import Link from "next/link"
import { Download, FileText, ArrowLeft, Bot } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { Button } from "@/components/ui/button"
import { Toolbar } from "./Toolbar"
import { SidePanel } from "./SidePanel"
import { EditorPane, type EditorPaneRef } from "./EditorPane"
import {
  updateSceneSetting,
  updateScriptElementContent,
  createElement,
  deleteScriptElement,
  createScene,
  deleteScene,
  addComment,
  updateComment,
  deleteComment,
  toggleCommentResolved,
  type FullProject,
  type Scene,
  type ScriptElement,
} from "@/services/project"
import { getKeyString, createKeymap } from "@/lib/editor/keymap";
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { AIChatPanel } from "./AIChatPanel"

type ScriptItem = { type: "SCENE_HEADING"; data: Scene } | { type: "ELEMENT"; data: ScriptElement }

interface ScreenplayEditorProps {
  projectData: FullProject
}

export function ScreenplayEditor({ projectData: initialProjectData }: ScreenplayEditorProps) {
  const [project, setProject] = useState<FullProject>(initialProjectData)
  const [activeElementId, setActiveElementId] = useState<string | null>(null)
  const [activeElementType, setActiveElementType] = useState<ToolbarScriptElementType | null>(null)
  const [elementToFocus, setElementToFocus] = useState<string | null>(null)
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const elementRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const editorPaneRef = useRef<EditorPaneRef>(null)
  const sidePanelRef = useRef<HTMLDivElement>(null)

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

  const handleAddComment = useCallback((elementId: string, isScene: boolean, content: string) => {
    addComment(elementId, isScene, content)
      .then((newComment) => {
        setProject((prevProject) => {
          const newActs = prevProject.acts.map((act) => ({
            ...act,
            scenes: act.scenes.map((scene) => {
              if (isScene && scene.id === elementId) {
                return { ...scene, comments: [...(scene.comments || []), newComment] }
              }
              return {
                ...scene,
                elements: scene.elements.map((el) => {
                  if (!isScene && el.id === elementId) {
                    return { ...el, comments: [...(el.comments || []), newComment] }
                  }
                  return el
                }),
              }
            }),
          }))
          return { ...prevProject, acts: newActs }
        })
      })
      .catch((err) => console.error("Failed to add comment:", err))
  }, [])

  const handleUpdateComment = useCallback((commentId: string, content: string) => {
    setProject((prevProject) => {
      const newActs = prevProject.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((scene) => ({
          ...scene,
          comments: scene.comments?.map((c) => (c.id === commentId ? { ...c, content } : c)),
          elements: scene.elements.map((el) => ({
            ...el,
            comments: el.comments?.map((c) => (c.id === commentId ? { ...c, content } : c)),
          })),
        })),
      }))
      return { ...prevProject, acts: newActs }
    })

    updateComment(commentId, content).catch((err) => {
      console.error("Failed to update comment:", err)
    })
  }, [])

  const handleDeleteComment = useCallback((commentId: string) => {
    setProject((prevProject) => {
      const newActs = prevProject.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((scene) => ({
          ...scene,
          comments: scene.comments?.filter((c) => c.id !== commentId),
          elements: scene.elements.map((el) => ({
            ...el,
            comments: el.comments?.filter((c) => c.id !== commentId),
          })),
        })),
      }))
      return { ...prevProject, acts: newActs }
    })

    deleteComment(commentId).catch((err) => {
      console.error("Failed to delete comment:", err)
    })
  }, [])


  const handleToggleCommentResolved = useCallback(
    (elementId: string, commentId: string, isScene: boolean, newResolvedState: boolean) => {
      const originalProject = JSON.parse(JSON.stringify(project));

      setProject((prevProject) => {
        const newActs = prevProject.acts.map((act) => ({
          ...act,
          scenes: act.scenes.map((scene) => {
            if (isScene && scene.id === elementId) {
              return {
                ...scene,
                comments: scene.comments?.map((c) =>
                  c.id === commentId ? { ...c, isResolved: newResolvedState } : c,
                ),
              };
            }
            return {
              ...scene,
              elements: scene.elements.map((el) =>
                el.id === elementId
                  ? {
                    ...el,
                    comments: el.comments?.map((c) =>
                      c.id === commentId ? { ...c, isResolved: newResolvedState } : c,
                    ),
                  }
                  : el,
              ),
            };
          }),
        }));
        return { ...prevProject, acts: newActs };
      });

      toggleCommentResolved(commentId, newResolvedState).catch((err) => {
        console.error("Failed to toggle comment resolved status:", err);
        setProject(originalProject);
      });
    },
    [project],
  );

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

      if (idToInsertAfter) {
        for (const act of project.acts) {
          for (const scene of act.scenes) {
            if (isTargetScene && scene.id === idToInsertAfter) {
              sceneId = scene.id
              insertIndex = 0
              break
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
      } else if (allScenes.length > 0) {
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
      const originalProjectState = project

      const deletedItemIndex = flattenedScriptItems.findIndex((item) => item.data.id === elementIdToDelete)
      if (deletedItemIndex > 0) {
        const previousElementId = flattenedScriptItems[deletedItemIndex - 1].data.id
        setElementToFocus(previousElementId)
      }

      setProject((prevProject) => {
        const newActs = prevProject.acts.map((act) => ({
          ...act,
          scenes: act.scenes.map((scene) => ({
            ...scene,
            elements: scene.elements.filter((el) => el.id !== elementIdToDelete),
          })),
        }))
        return { ...prevProject, acts: newActs }
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
        const newActs = prevProject.acts.map((act) => ({
          ...act,
          scenes: act.scenes.filter((scene) => scene.id !== sceneIdToDelete),
        }))
        return { ...prevProject, acts: newActs }
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
    if (!project.acts || project.acts.length === 0) {
      console.error("Cannot add a scene: No acts exist in the project.")
      return
    }

    const lastAct = project.acts[project.acts.length - 1]
    const newSceneData = { setting: "" }

    createScene(lastAct.id, newSceneData)
      .then((createdScene) => {
        setProject((prevProject) => {
          const newActs = prevProject.acts.map((act) => {
            if (act.id === lastAct.id) {
              return { ...act, scenes: [...act.scenes, createdScene] }
            }
            return act
          })
          return { ...prevProject, acts: newActs }
        })

        setElementToFocus(createdScene.id)
      })
      .catch((err) => {
        console.error("Failed to create new scene:", err)
      })
  }, [project.acts])

  const toggleAIChat = useCallback(() => {
    setIsAIChatOpen((prev) => !prev)
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
            <Button variant="outline" className="gap-2 bg-transparent" onClick={toggleAIChat}>
              <Bot className="h-4 w-4" />
              Writing Buddy
            </Button>
            <Button variant="outline" className="gap-2 bg-transparent">
              <Download className="h-4 w-4" />
              Export
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
                (scene) => scene.id === activeElementId || scene.elements.some((el) => el.id === activeElementId),
              )?.setting
              : undefined
          }
          currentElement={activeElementId || undefined}
        />
      </div>
    </div>
  )
}
