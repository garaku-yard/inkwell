"use client"

import React, { useRef, useImperativeHandle } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Scene, ScriptElement } from "@/services/project"
import { EditableElement } from "./EditableElement"
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"

type ScriptItem = { type: "SCENE_HEADING"; data: Scene } | { type: "ELEMENT"; data: ScriptElement }

interface EditorPaneProps {
  items: ScriptItem[]
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
}


export interface EditorPaneRef {
  scrollToIndex: (index: number) => void
  getScriptContainer: () => HTMLDivElement | null
}

export const EditorPane = React.memo(
  React.forwardRef<EditorPaneRef, EditorPaneProps>((props, ref) => {
    const { items, elementRefs, onContentChange, onFinalizeUpdate, onKeyDown, activeElementId, onFocus, onBlur } = props
    const parentRef = useRef<HTMLDivElement>(null)
    const scriptContainerRef = useRef<HTMLDivElement>(null)
    const pagesContainerRef = useRef<HTMLDivElement>(null)
    const contentOnlyRef = useRef<HTMLDivElement>(null)

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

    const A4_HEIGHT_PX = 11.69 * 96
    const PAGE_CONTENT_HEIGHT = A4_HEIGHT_PX - (2 * 96)

    const organizeItemsIntoPages = () => {
      const pages: { items: ScriptItem[], height: number }[] = []
      let currentPageHeight = 0
      let currentPageItems: ScriptItem[] = []

      items.forEach((item, index) => {
        const estimatedHeight = rowVirtualizer.options.estimateSize(index)

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
      <div ref={parentRef} className="flex-1 overflow-auto p-8 bg-gray-100 dark:bg-gray-900">
        {/* Multiple A4 pages */}
        <div ref={pagesContainerRef} className="mx-auto space-y-8">
          {pages.map((page, pageIndex) => (
            <div
              key={pageIndex}
              id={`page-${pageIndex}`}
              ref={pageIndex === 0 ? scriptContainerRef : undefined}
              className="w-[8.27in] h-[11.69in] bg-white dark:bg-gray-800 shadow-2xl relative font-mono text-[12pt] leading-[1.5] mx-auto overflow-hidden"
              style={{
                paddingTop: '1in',
                paddingBottom: '1in',
                paddingLeft: '1.5in',
                paddingRight: '1in'
              }}
            >
              <div className="absolute right-4 top-4 text-xs text-gray-400 pointer-events-none">
                Page {pageIndex + 1}
              </div>

              <div
                className="h-full relative screenplay-content"
                ref={pageIndex === 0 ? contentOnlyRef : undefined}
                data-screenplay-content
              >
                {page.items.map((item) => {
                  const element = item.data

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
                      />
                    </div>
                  )
                })}
              </div>

              {pageIndex < pages.length - 1 && (
                <div className="absolute bottom-0 left-0 w-full h-px bg-gray-300 dark:bg-gray-600" />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }),
)

EditorPane.displayName = "EditorPane"
