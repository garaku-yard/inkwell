"use client"

import React, { useRef, useImperativeHandle, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Scene, ScriptElement } from "@/services/project"
import { EditableElement } from "./EditableElement"
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"

type ScriptItem = { type: "SCENE_HEADING"; data: Scene } | { type: "ELEMENT"; data: ScriptElement }

interface EditorPaneProps {
  items: ScriptItem[]
  scenes: Scene[]
  elementRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>
  onContentChange: (id: string, content: string, isScene: boolean) => void
  onFinalizeUpdate: (id: string, content: string, isScene: boolean) => void
  onKeyDown: (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean,
    elementType: ToolbarScriptElementType | "SCENE_HEADING",
  ) => void
  activeElementId: string | null
  onFocus: (id: string, type: ToolbarScriptElementType | "SCENE_HEADING" | null) => void
  onBlur: () => void
  focusAtEndId: string | null
  onFocusHandled: () => void
  onAddNewScene?: () => void
}


export interface EditorPaneRef {
  scrollToIndex: (index: number) => void
  getScriptContainer: () => HTMLDivElement | null
}

export const EditorPane = React.memo(
  React.forwardRef<EditorPaneRef, EditorPaneProps>((props, ref) => {
    const { items, scenes, elementRefs, onContentChange, onFinalizeUpdate, onKeyDown, activeElementId, onFocus, onBlur, focusAtEndId, onFocusHandled, onAddNewScene } = props
    const parentRef = useRef<HTMLDivElement>(null)
    const scriptContainerRef = useRef<HTMLDivElement>(null)
    const pagesContainerRef = useRef<HTMLDivElement>(null)
    const contentOnlyRef = useRef<HTMLDivElement>(null)
    const lastEnterTimeRef = useRef<number>(0)
    const DOUBLE_ENTER_THRESHOLD = 300

    const handleEmptyEditorKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && onAddNewScene) {
        e.preventDefault()
        const now = Date.now()
        const isDoubleEnter = (now - lastEnterTimeRef.current) < DOUBLE_ENTER_THRESHOLD
        lastEnterTimeRef.current = now
        
        if (isDoubleEnter) {
          onAddNewScene()
        }
      }
    }

    // Auto-focus the empty editor when it's empty
    useEffect(() => {
      if (items.length === 0 && contentOnlyRef.current) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          contentOnlyRef.current?.focus()
        }, 100)
      }
    }, [items.length])

    const rowVirtualizer = useVirtualizer({
      count: items.length,
      getScrollElement: () => parentRef.current,
      estimateSize: (index) => {
        const item = items[index]
        if (!item) return 40

        const content = item.type === "SCENE_HEADING" ? item.data.scene_heading : item.data.content
        const contentLength = content.length

        const estimatedLines = Math.max(1, Math.ceil(contentLength / 80))
        return Math.max(40, estimatedLines * 24)
      },
      overscan: 10,
      measureElement: (element) => element.getBoundingClientRect().height,
    })

    // US Letter: 8.5in x 11in at 96 DPI
    // With margins: 1in top, 1in bottom = 9in content height
    // 9 inches × 96 DPI = 864px available for content
    const PAGE_CONTENT_HEIGHT = 9 * 96 // 864px

    const organizeItemsIntoPages = () => {
      const pages: { items: ScriptItem[], height: number }[] = []
      let currentPageHeight = 0
      let currentPageItems: ScriptItem[] = []

      // Use a more realistic line height calculation
      // 12pt font with 1.5 line-height = 18pt = ~24px per line
      const LINE_HEIGHT = 24
      const ELEMENT_PADDING = 8 // py-1 = 4px top + 4px bottom

      items.forEach((item) => {
        const content = item.type === "SCENE_HEADING" ? item.data.scene_heading : item.data.content
        // Calculate based on actual content - roughly 60 chars per line for screenplay
        const lines = Math.max(1, Math.ceil((content?.length || 0) / 60))
        const estimatedHeight = (lines * LINE_HEIGHT) + ELEMENT_PADDING

        if (currentPageHeight + estimatedHeight > PAGE_CONTENT_HEIGHT && currentPageItems.length > 0) {
          pages.push({ items: [...currentPageItems], height: currentPageHeight })
          currentPageItems = [item]
          currentPageHeight = estimatedHeight
        } else {
          currentPageItems.push(item)
          currentPageHeight += estimatedHeight
        }
      })

      if (currentPageItems.length > 0) {
        pages.push({ items: [...currentPageItems], height: currentPageHeight })
      }

      return pages
    }

    const pages = organizeItemsIntoPages()

    useImperativeHandle(ref, () => ({
      scrollToIndex: (index: number) => {
        let itemIndex = 0
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
          if (itemIndex + pages[pageIndex].items.length > index) {
            const pageElement = document.getElementById(`page-${pageIndex}`)
            if (pageElement) {
              pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
            break
          }
          itemIndex += pages[pageIndex].items.length
        }
      },
      getScriptContainer: () => contentOnlyRef.current,
    }))

    return (
      <div ref={parentRef} className="flex-1 overflow-auto p-8 bg-gray-100 dark:bg-black">
        {/* Multiple US Letter pages (standard screenplay format) */}
        <div ref={pagesContainerRef} className="mx-auto space-y-8">
          {pages.length === 0 ? (
            // Empty state - show a placeholder page that allows double-enter to create a scene
            <div
              ref={scriptContainerRef}
              className="bg-white dark:bg-gray-900 shadow-2xl relative font-mono text-[12pt] leading-[1.5] mx-auto overflow-hidden box-border"
              style={{
                width: '8.5in',
                height: '11in',
                paddingTop: '1in',
                paddingBottom: '1in',
                paddingLeft: '1.5in',
                paddingRight: '1in'
              }}
            >
              <div className="absolute text-xs text-gray-400 pointer-events-none" style={{ top: '0.5in', right: '1in' }}>
                Page 1
              </div>
              <div
                ref={contentOnlyRef}
                className="h-full relative screenplay-content flex items-start justify-center pt-20 outline-none"
                data-screenplay-content
                tabIndex={0}
                onKeyDown={handleEmptyEditorKeyDown}
              >
                <div className="text-gray-400 text-sm text-center">
                  <p className="mb-2">Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded border">Enter</kbd> twice to create a new scene</p>
                  <p>or use the "New Scene" button in the toolbar</p>
                </div>
              </div>
            </div>
          ) : (
            pages.map((page, pageIndex) => (
            <div
              key={pageIndex}
              id={`page-${pageIndex}`}
              ref={pageIndex === 0 ? scriptContainerRef : undefined}
              className="bg-white dark:bg-gray-900 shadow-2xl relative font-mono text-[12pt] leading-[1.5] mx-auto overflow-hidden box-border"
              style={{
                width: '8.5in',
                height: '11in',
                paddingTop: '1in',
                paddingBottom: '1in',
                paddingLeft: '1.5in',
                paddingRight: '1in'
              }}
            >
              <div className="absolute text-xs text-gray-400 pointer-events-none" style={{ top: '0.5in', right: '1in' }}>
                Page {pageIndex + 1}
              </div>

              <div
                className="h-full relative screenplay-content"
                ref={pageIndex === 0 ? contentOnlyRef : undefined}
                data-screenplay-content
              >
                {page.items.map((item) => {
                  const element = item.data
                  // Get the current scene ID - for scene headings it's the scene itself, for elements it's the scene_id
                  const currentSceneId = item.type === "SCENE_HEADING" 
                    ? element.id 
                    : (element as ScriptElement).scene_id || ""

                  return (
                    <div key={element.id} className="relative">
                      <EditableElement
                        ref={(el) => {
                          elementRefs.current.set(element.id, el)
                        }}
                        element={element}
                        onContentChange={onContentChange}
                        onFinalizeUpdate={onFinalizeUpdate}
                        onKeyDown={onKeyDown}
                        activeElementId={activeElementId}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        focusAtEnd={focusAtEndId === element.id}
                        onFocusHandled={onFocusHandled}
                        scenes={scenes}
                        currentSceneId={currentSceneId}
                      />
                    </div>
                  )
                })}
              </div>

              {pageIndex < pages.length - 1 && (
                <div className="absolute bottom-0 left-0 w-full h-px bg-gray-300 dark:bg-gray-600" />
              )}
            </div>
          ))
          )}
        </div>
      </div>
    )
  }),
)

EditorPane.displayName = "EditorPane"
