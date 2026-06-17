import type React from "react"
import { useCallback, type RefObject } from "react"

import {
  createScene,
  createElement,
  type FullProject,
  type Scene,
  type ProjectElement,
} from "@/services/project"
import { deleteScriptElement, updateScriptElement, deleteScene } from "@/services/editor"
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"

/** Discriminated union mirroring ScreenplayEditor's local `ScriptItem` —
 *  the flat list of scenes interleaved with their elements that the
 *  delete and navigate handlers walk to find neighbours. */
type ScriptItem =
  | { type: "SCENE_HEADING"; data: Scene }
  | { type: "ELEMENT"; data: ProjectElement }

interface ToastInput {
  title?: string
  description?: string
  variant?: "default" | "destructive"
}

interface UseScreenplayElementsOptions {
  project: FullProject
  setProject: React.Dispatch<React.SetStateAction<FullProject>>
  activeElementId: string | null
  setActiveElementType: React.Dispatch<
    React.SetStateAction<ToolbarScriptElementType | "SCENE_HEADING" | null>
  >
  /** Flat list of scenes + their elements in render order. Owned by the
   *  parent because other call sites (the side panel, comment threads)
   *  consume it too. */
  flattenedScriptItems: ScriptItem[]
  /** Convenience handle for the "no target -> append at end" branch in
   *  handleInsertElement. Owned by the parent for the same reason as
   *  flattenedScriptItems. */
  allScenes: Scene[]
  elementRefs: RefObject<Map<string, HTMLDivElement | null>>
  scrollToElement: (id: string) => void
  focusElementAtEnd: (id: string, delay?: number) => void
  userId: string | undefined
  toast: (input: ToastInput) => void
}

/** Returns the element-mutation handlers ScreenplayEditor binds to its
 *  toolbar, keymap, and side-panel callbacks. State (project, scenes,
 *  active element id) stays in the parent — the hook only owns the
 *  reasons to mutate it: insert / transform / delete / navigate /
 *  select-all / change-type / add-scene. Bodies are moved verbatim from
 *  the parent; this is rehoming, not redesign. */
export function useScreenplayElements({
  project,
  setProject,
  activeElementId,
  setActiveElementType,
  flattenedScriptItems,
  allScenes,
  elementRefs,
  scrollToElement,
  focusElementAtEnd,
  userId,
  toast,
}: UseScreenplayElementsOptions) {
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

      if (!project.id || !userId) {
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
        line_number: Math.max(insertIndex, 1),
      }

      createElement(project.id, userId, newElementData)
        .then((createdElement) => {
          setProject((prevProject) => {
            const newScenes =
              prevProject.scenes?.map((scene) => {
                if (scene.id !== sceneId) return scene
                const newElements = [...(scene.elements || [])]
                newElements.splice(insertIndex, 0, createdElement)
                return { ...scene, elements: newElements }
              }) || []
            return { ...prevProject, scenes: newScenes }
          })

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
    [
      project.scenes,
      project.id,
      activeElementId,
      allScenes,
      userId,
      toast,
      scrollToElement,
      focusElementAtEnd,
      setProject,
    ],
  )

  const handleTransformElement = useCallback(
    (newType: ToolbarScriptElementType | "SCENE_HEADING") => {
      if (!activeElementId || !userId || !project.id) return

      let elementToTransform: ProjectElement | null = null
      let sceneToTransform: Scene | null = null
      let parentSceneId: string | null = null
      let elementIndex = 0

      for (const scene of project.scenes || []) {
        if (scene.id === activeElementId) {
          sceneToTransform = scene
          break
        }
        const foundIndex = scene.elements?.findIndex((el) => el.id === activeElementId) ?? -1
        if (foundIndex !== -1) {
          elementToTransform = scene.elements![foundIndex]
          parentSceneId = scene.id
          elementIndex = foundIndex
          break
        }
      }
      void elementIndex

      // Case 1: Transform Element → Scene
      if (elementToTransform && newType === "SCENE_HEADING") {
        const content = elementToTransform.content
        const sceneIndex = project.scenes?.findIndex((s) => s.id === parentSceneId) ?? 0
        const newSceneData = {
          scene_heading: content,
          content: "",
          order_index: sceneIndex + 1,
        }

        createScene(project.id, userId, newSceneData)
          .then((createdScene) => {
            setProject((prevProject) => {
              const newScenes =
                prevProject.scenes?.map((scene) => {
                  if (scene.id !== parentSceneId) return scene
                  return {
                    ...scene,
                    elements: scene.elements?.filter((el) => el.id !== activeElementId),
                  }
                }) || []

              const insertIndex = newScenes.findIndex((s) => s.id === parentSceneId) + 1
              newScenes.splice(insertIndex, 0, createdScene)

              return { ...prevProject, scenes: newScenes }
            })

            deleteScriptElement(activeElementId).catch(console.error)

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
        const sceneIndex = project.scenes?.findIndex((s) => s.id === activeElementId) ?? 0
        const targetSceneId =
          sceneIndex > 0
            ? project.scenes![sceneIndex - 1].id
            : project.scenes && project.scenes.length > 1
              ? project.scenes[1].id
              : null

        if (!targetSceneId) {
          toast({
            title: "Cannot transform",
            description:
              "Need at least one other scene to transform this scene to an element.",
            variant: "destructive",
          })
          return
        }

        const targetScene = project.scenes?.find((s) => s.id === targetSceneId)
        const insertIndex = targetScene?.elements?.length || 0

        const newElementData = {
          scene_id: targetSceneId,
          element_type: newType as ToolbarScriptElementType,
          content: content,
          line_number: Math.max(insertIndex, 1),
        }

        createElement(project.id, userId, newElementData)
          .then((createdElement) => {
            setProject((prevProject) => {
              const newScenes =
                prevProject.scenes
                  ?.filter((scene) => scene.id !== activeElementId)
                  ?.map((scene) => {
                    if (scene.id !== targetSceneId) return scene
                    return {
                      ...scene,
                      elements: [...(scene.elements || []), createdElement],
                    }
                  }) || []

              return { ...prevProject, scenes: newScenes }
            })

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

        setProject((prevProject) => {
          const newScenes = prevProject.scenes?.map((scene) => ({
            ...scene,
            elements: scene.elements?.map((el) =>
              el.id === activeElementId
                ? { ...el, element_type: newType as ToolbarScriptElementType }
                : el,
            ),
          }))
          return { ...prevProject, scenes: newScenes }
        })

        setActiveElementType(newType as ToolbarScriptElementType)

        updateScriptElement(activeElementId, {
          elementType: newType as ToolbarScriptElementType,
        }).catch((err) => {
          console.error("Failed to transform element:", err)
          setProject((prevProject) => {
            const newScenes = prevProject.scenes?.map((scene) => ({
              ...scene,
              elements: scene.elements?.map((el) =>
                el.id === activeElementId
                  ? { ...el, element_type: elementToTransform!.element_type }
                  : el,
              ),
            }))
            return { ...prevProject, scenes: newScenes }
          })
          setActiveElementType(elementToTransform!.element_type as ToolbarScriptElementType)
          toast({
            title: "Error",
            description: "Failed to transform element. Please try again.",
            variant: "destructive",
          })
        })
      }
    },
    [
      activeElementId,
      project.id,
      project.scenes,
      userId,
      toast,
      scrollToElement,
      focusElementAtEnd,
      setProject,
      setActiveElementType,
    ],
  )

  const handleDeleteElement = useCallback(
    (elementIdToDelete: string) => {
      const originalProjectState = project

      const deletedItemIndex = flattenedScriptItems.findIndex(
        (item) => item.data.id === elementIdToDelete,
      )
      if (deletedItemIndex > 0) {
        const previousElementId = flattenedScriptItems[deletedItemIndex - 1].data.id
        scrollToElement(previousElementId)
        focusElementAtEnd(previousElementId, 50)
      }

      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject

        const newScenes = prevProject.scenes.map((scene: Scene) => ({
          ...scene,
          elements: scene.elements?.filter(
            (el: ProjectElement) => el.id !== elementIdToDelete,
          ),
        }))

        return { ...prevProject, scenes: newScenes }
      })

      deleteScriptElement(elementIdToDelete).catch((err) => {
        console.error("Failed to delete element:", err)
        setProject(originalProjectState)
      })
    },
    [project, flattenedScriptItems, scrollToElement, focusElementAtEnd, setProject],
  )

  const handleDeleteScene = useCallback(
    (sceneIdToDelete: string) => {
      const originalProjectState = project

      const deletedItemIndex = flattenedScriptItems.findIndex(
        (item) => item.data.id === sceneIdToDelete,
      )
      if (deletedItemIndex > 0) {
        const previousElementId = flattenedScriptItems[deletedItemIndex - 1].data.id
        scrollToElement(previousElementId)
        focusElementAtEnd(previousElementId, 50)
      }

      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject

        const newScenes = prevProject.scenes.filter(
          (scene: Scene) => scene.id !== sceneIdToDelete,
        )

        return { ...prevProject, scenes: newScenes }
      })

      deleteScene(sceneIdToDelete).catch((err) => {
        console.error("Failed to delete scene:", err)
        setProject(originalProjectState)
      })
    },
    [project, flattenedScriptItems, scrollToElement, focusElementAtEnd, setProject],
  )

  const handleSelectAll = useCallback(
    async (e: React.KeyboardEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()

      const textElements = Array.from(
        document.querySelectorAll("[data-screenplay-text]"),
      ) as HTMLElement[]

      if (textElements.length === 0) return

      const screenplay = textElements.map((el) => el.textContent || "").join("\n")

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(screenplay)
        } else {
          const textArea = document.createElement("textarea")
          textArea.value = screenplay
          textArea.style.position = "fixed"
          textArea.style.left = "-999999px"
          textArea.style.top = "-999999px"
          document.body.appendChild(textArea)
          textArea.focus()
          textArea.select()

          try {
            document.execCommand("copy")
          } finally {
            textArea.remove()
          }
        }

        toast({
          title: "Copied to clipboard",
          description: `${textElements.length} screenplay elements copied successfully.`,
        })

        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()

          textElements.forEach((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            selection.addRange(range)
          })

          setTimeout(() => {
            selection.removeAllRanges()
          }, 150)
        }
      } catch (err) {
        console.error("Failed to copy screenplay:", err)
        toast({
          title: "Copy failed",
          description: "Could not copy screenplay to clipboard.",
          variant: "destructive",
        })
      }
    },
    [toast],
  )

  const handleChangeElementType = useCallback(
    (elementId: string, newType: ToolbarScriptElementType, currentContent: string) => {
      const originalProjectState = project

      if (!userId) {
        console.error("Cannot change element type: No user ID available.")
        return
      }

      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject

        const newScenes = prevProject.scenes.map((scene: Scene) => ({
          ...scene,
          elements: scene.elements?.map((el: ProjectElement) =>
            el.id === elementId
              ? { ...el, element_type: newType, content: currentContent }
              : el,
          ),
        }))

        return { ...prevProject, scenes: newScenes }
      })

      updateScriptElement(elementId, {
        elementType: newType,
        content: currentContent,
      }).catch((err) => {
        console.error("Failed to change element type:", err)
        setProject(originalProjectState)
        toast({
          title: "Error",
          description: "Failed to change element type.",
          variant: "destructive",
        })
      })
    },
    [project, userId, toast, setProject],
  )

  const handleNavigateToPrevious = useCallback(
    (currentElementId: string) => {
      const currentIndex = flattenedScriptItems.findIndex(
        (item) => item.data.id === currentElementId,
      )
      if (currentIndex > 0) {
        const previousElementId = flattenedScriptItems[currentIndex - 1].data.id
        scrollToElement(previousElementId)
        focusElementAtEnd(previousElementId, 0)
      }
    },
    [flattenedScriptItems, scrollToElement, focusElementAtEnd],
  )

  const handleNavigateToNext = useCallback(
    (currentElementId: string) => {
      const currentIndex = flattenedScriptItems.findIndex(
        (item) => item.data.id === currentElementId,
      )
      if (currentIndex < flattenedScriptItems.length - 1) {
        const nextElementId = flattenedScriptItems[currentIndex + 1].data.id
        const nextElement = elementRefs.current?.get(nextElementId) ?? null
        if (nextElement) {
          nextElement.focus()
          const selection = window.getSelection()
          if (selection) {
            const range = document.createRange()
            range.selectNodeContents(nextElement)
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)
          }
        }
        scrollToElement(nextElementId)
      }
    },
    [flattenedScriptItems, scrollToElement, elementRefs],
  )

  const handleAddNewScene = useCallback(() => {
    if (!project.id || !userId) {
      console.error("Cannot add a scene: No project ID or user ID available.")
      return
    }

    const newSceneData = {
      scene_heading: "",
      content: "",
      order_index: project.scenes?.length || 0,
    }

    createScene(project.id, userId, newSceneData)
      .then((createdScene) => {
        setProject((prevProject) => ({
          ...prevProject,
          scenes: [...(prevProject.scenes || []), createdScene],
        }))

        scrollToElement(createdScene.id)
        focusElementAtEnd(createdScene.id, 100)
      })
      .catch((err) => {
        console.error("Failed to create new scene:", err)
      })
  }, [
    project.id,
    project.scenes,
    userId,
    scrollToElement,
    focusElementAtEnd,
    setProject,
  ])

  return {
    handleInsertElement,
    handleTransformElement,
    handleDeleteElement,
    handleDeleteScene,
    handleSelectAll,
    handleChangeElementType,
    handleNavigateToPrevious,
    handleNavigateToNext,
    handleAddNewScene,
  }
}
