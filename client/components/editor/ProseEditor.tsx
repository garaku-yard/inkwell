"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { Plus, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { AIChatPanel } from "./AIChatPanel"
import { EditorHeader } from "./shared/EditorHeader"
import { EmptyEditorState } from "./shared/EmptyEditorState"
import { useElementAutosave } from "./shared/useElementAutosave"
import { dispatchKey } from "@/lib/editor/keymap"
import { createProseKeymap } from "./prose/keymap"
import { exportProjectToText, exportProjectToMarkdown } from "@/lib/export/text-export"
import {
  createScene,
  createSceneElement,
  type ScriptElement,
  type FullProject,
} from "@/services/project"
import { deleteScriptElement } from "@/services/editor"

type ProseElementType =
  | "chapter_heading"
  | "paragraph"
  | "dialogue"
  | "scene_break"
  | "scene_heading_stinger"

interface ProseEditorProps {
  projectData: FullProject
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function ProseEditor({ projectData }: ProseEditorProps) {
  const { user } = useAuth()
  const [scenes, setScenes] = useState(() => projectData.scenes ?? [])
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const chapterRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const { saveStatus, scheduleSave } = useElementAutosave({ userId: user?.id })

  const totalWords = scenes.reduce((acc, scene) => {
    return acc + (scene.elements ?? []).reduce((s, el) => s + wordCount(el.content), 0)
  }, 0)

  const handleContentChange = useCallback((id: string, content: string, isScene: boolean) => {
    if (isScene) {
      setScenes(prev => prev.map(s => s.id === id ? { ...s, scene_heading: content } : s))
    } else {
      setScenes(prev => prev.map(s => ({
        ...s,
        elements: (s.elements ?? []).map(el => el.id === id ? { ...el, content } : el),
      })))
    }
    scheduleSave(id, content, isScene)
  }, [scheduleSave])

  const handleAddChapter = async () => {
    if (!user?.id) return
    const newScene = await createScene(projectData.id, user.id, {
      scene_heading: "",
      content: "",
      order_index: scenes.length,
    })
    setScenes(prev => [...prev, { ...newScene, elements: [] }])
    setTimeout(() => {
      chapterRefs.current.get(newScene.id)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 100)
  }

  const handleAddElement = async (sceneId: string, type: ProseElementType, afterIdx?: number) => {
    if (!user?.id) return
    const scene = scenes.find(s => s.id === sceneId)
    if (!scene) return
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : (scene.elements?.length ?? 0)
    const el = await createSceneElement(projectData.id, sceneId, user.id, {
      element_type: type,
      content: type === "scene_break" ? "* * *" : "",
      order_index: insertAt,
    })
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s
      const els = [...(s.elements ?? [])]
      els.splice(insertAt, 0, el)
      return { ...s, elements: els }
    }))
    setTimeout(() => {
      document.getElementById(`el-${el.id}`)?.focus()
    }, 50)
  }

  const handleDeleteElement = useCallback(
    async (sceneId: string, elementId: string) => {
      // Find the previous editable element id so we can land focus
      // there after the row vanishes — otherwise the document scrolls
      // to wherever React parks the next focusable element.
      const ids: string[] = []
      for (const s of scenes) {
        for (const el of s.elements ?? []) {
          if (el.element_type === "scene_break") continue
          ids.push(el.id)
        }
      }
      const idx = ids.indexOf(elementId)
      const prevId = idx > 0 ? ids[idx - 1] : null

      setScenes((prev) =>
        prev.map((s) =>
          s.id !== sceneId
            ? s
            : { ...s, elements: (s.elements ?? []).filter((el) => el.id !== elementId) },
        ),
      )
      try {
        await deleteScriptElement(elementId)
      } catch (err) {
        console.error("Failed to delete element:", err)
      }
      if (prevId) {
        setTimeout(() => {
          document.getElementById(`el-${prevId}`)?.focus()
        }, 50)
      }
    },
    [scenes],
  )

  const keyMap = useMemo(
    () =>
      createProseKeymap({
        scenes,
        insertParagraphAfter: (sceneId, afterIdx) =>
          void handleAddElement(sceneId, "paragraph", afterIdx),
        insertElementAfter: (sceneId, type, afterIdx) =>
          void handleAddElement(sceneId, type, afterIdx),
        insertNewChapter: () => void handleAddChapter(),
        deleteEmptyElement: (sceneId, elementId) =>
          void handleDeleteElement(sceneId, elementId),
      }),
    // handleAddElement is closed over scenes/user via useState/useAuth;
    // recreating the keymap when scenes changes is cheap and keeps the
    // navigation lookup honest.
    [scenes, handleDeleteElement],
  )

  const handleElementKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      sceneId: string,
      el: ScriptElement,
      elIdx: number,
    ) => {
      dispatchKey(e, keyMap, { sceneId, elementId: el.id, elementIndex: elIdx })
    },
    [keyMap],
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Chapter sidebar */}
      <aside className="w-52 border-r flex flex-col shrink-0 bg-sidebar">
        <div className="flex items-center gap-2 p-3 border-b">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Chapters</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {scenes.map((scene, i) => {
            const chWords = (scene.elements ?? []).reduce((a, el) => a + wordCount(el.content), 0)
            return (
              <button
                key={scene.id}
                onClick={() => chapterRefs.current.get(scene.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent group"
              >
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-xs text-muted-foreground/50 shrink-0">{i + 1}</span>
                  <span className="truncate text-muted-foreground group-hover:text-foreground transition-colors">
                    {scene.scene_heading || "Untitled"}
                  </span>
                </div>
                {chWords > 0 && (
                  <p className="text-xs text-muted-foreground/40 pl-4 mt-0.5">{chWords.toLocaleString()}w</p>
                )}
              </button>
            )
          })}
        </div>

        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start text-xs" onClick={handleAddChapter}>
            <Plus className="h-3.5 w-3.5" />
            Add chapter
          </Button>
        </div>
      </aside>

      {/* Main editor */}
      <div className="flex flex-col flex-1 min-w-0">
        <EditorHeader
          title={projectData.title}
          subtitle={projectData.category === "memoir" ? "Memoir" : "Novel"}
          statRight={`${totalWords.toLocaleString()} words`}
          saveStatus={saveStatus}
          onToggleAI={() => setIsAIChatOpen(o => !o)}
          exportItems={[
            {
              label: "Export as Plain Text (.txt)",
              onClick: () => exportProjectToText({ ...projectData, scenes }),
            },
            {
              label: "Export as Markdown (.md)",
              onClick: () => exportProjectToMarkdown({ ...projectData, scenes }),
            },
          ]}
        />

        <div className="flex flex-1 overflow-hidden">
        {/* Manuscript scroll area */}
        <div className="flex-1 overflow-y-auto bg-secondary dark:bg-background">
          <div className="inkwell-editor-content max-w-[680px] mx-auto px-10 py-16">
            {scenes.length === 0 ? (
              <EmptyEditorState
                message="No chapters yet."
                actionLabel="Add first chapter"
                onAction={handleAddChapter}
              />
            ) : (
              scenes.map((scene, chapterIdx) => (
                <div
                  key={scene.id}
                  ref={(el) => { chapterRefs.current.set(scene.id, el) }}
                  className={cn("mb-24", chapterIdx > 0 && "pt-16 border-t border-border/40")}
                >
                  {/* Chapter label — centered, small caps feel */}
                  <p className="text-center text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2 select-none">
                    Chapter {chapterIdx + 1}
                  </p>

                  {/* Chapter title — centered, editable */}
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => handleContentChange(scene.id, e.currentTarget.textContent ?? "", true)}
                    className="text-center text-2xl font-semibold outline-none mb-14 min-h-[2rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30"
                    data-placeholder="Untitled"
                  >
                    {scene.scene_heading || ""}
                  </div>

                  {/* Body elements */}
                  <div className="text-base leading-loose">
                    {(scene.elements ?? []).length === 0 ? (
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        className="outline-none pl-10 min-h-[1.75rem] empty:before:content-['Start\00a0writing…'] empty:before:text-muted-foreground/30 empty:before:pl-0"
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            await handleAddElement(scene.id, "paragraph")
                          }
                        }}
                      />
                    ) : (
                      (scene.elements ?? []).map((el, elIdx) => {
                        if (el.element_type === "scene_break") {
                          return (
                            <div key={el.id} className="text-center text-muted-foreground my-8 tracking-widest select-none">
                              * * *
                            </div>
                          )
                        }

                        if (el.element_type === "chapter_heading") {
                          return (
                            <div
                              key={el.id}
                              id={`el-${el.id}`}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                              onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                              className="text-xl font-semibold mt-10 mb-3 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30"
                              data-placeholder="Section heading"
                            >
                              {el.content}
                            </div>
                          )
                        }

                        if (el.element_type === "scene_heading_stinger") {
                          // Bolder stage-direction-style opener: small caps,
                          // wider letter-spacing, italic, with a hairline rule
                          // beneath. Used for "Three weeks later." or
                          // "MEANWHILE, ACROSS TOWN" style transitions.
                          return (
                            <div
                              key={el.id}
                              id={`el-${el.id}`}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                              onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                              className="mt-12 mb-6 italic text-base tracking-wider uppercase text-foreground/80 border-b border-border/40 pb-2 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30 empty:before:not-italic empty:before:normal-case empty:before:tracking-normal"
                              data-placeholder="Stinger…"
                            >
                              {el.content}
                            </div>
                          )
                        }

                        if (el.element_type === "dialogue") {
                          // Distinct from a paragraph: hanging indent for
                          // multi-line dialogue, opening curly quote in
                          // place of the first-line indent, slightly
                          // tighter line-height to set it apart visually.
                          return (
                            <div
                              key={el.id}
                              id={`el-${el.id}`}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                              onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                              className="outline-none min-h-[1.75rem] pl-10 -indent-6 leading-relaxed before:content-['“'] before:mr-1 before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30 empty:before:pl-0 empty:before:mr-0"
                              data-placeholder="Dialogue…"
                            >
                              {el.content}
                            </div>
                          )
                        }

                        // paragraph — standard first-line indent, no gap between consecutive paragraphs
                        return (
                          <div
                            key={el.id}
                            id={`el-${el.id}`}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                            onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                            className={cn(
                              "outline-none min-h-[1.75rem]",
                              // First paragraph after chapter title, section
                              // heading, or stinger sits flush left — every
                              // other paragraph gets the standard first-line
                              // indent. Dialogue + scene_break above also
                              // reset the indent because they break the
                              // visual flow of consecutive prose.
                              elIdx === 0 ||
                                ["chapter_heading", "scene_heading_stinger", "dialogue", "scene_break"].includes(
                                  (scene.elements ?? [])[elIdx - 1]?.element_type ?? "",
                                )
                                ? ""
                                : "pl-10",
                              "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30 empty:before:pl-0",
                            )}
                            data-placeholder={elIdx === 0 ? "Start writing…" : ""}
                          >
                            {el.content}
                          </div>
                        )
                      })
                    )}
                  </div>

                  {/* Insert toolbar — shown faintly below each chapter body */}
                  <div className="flex items-center gap-1 mt-8 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <span className="text-xs text-muted-foreground/60 mr-1">Insert</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(scene.id, "paragraph")}>
                      Paragraph
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(scene.id, "dialogue")}>
                      Dialogue
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(scene.id, "chapter_heading")}>
                      Section
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(scene.id, "scene_heading_stinger")}>
                      Stinger
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(scene.id, "scene_break")}>
                      Scene break
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <AIChatPanel isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} category={projectData.category} projectId={projectData.id} />
        </div>
      </div>
    </div>
  )
}
