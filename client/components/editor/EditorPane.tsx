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
  // Add a method to get the script container DOM element
  getScriptContainer: () => HTMLDivElement | null
}

export const EditorPane = React.memo(
  React.forwardRef<EditorPaneRef, EditorPaneProps>((props, ref) => {
    const { items, elementRefs, onContentChange, onFinalizeUpdate, onKeyDown, activeElementId, onFocus, onBlur } = props
    const parentRef = useRef<HTMLDivElement>(null)
    const scriptContainerRef = useRef<HTMLDivElement>(null)

    const rowVirtualizer = useVirtualizer({
      count: items.length,
      getScrollElement: () => parentRef.current,
      estimateSize: (index) => {
        // Dynamic height estimation based on content length
        const item = items[index]
        if (!item) return 40
        
        const content = item.type === "SCENE_HEADING" ? item.data.scene_heading : item.data.content
        const contentLength = content.length
        
        // Estimate height based on content length and line wrapping
        // Assume ~80 characters per line for screenplay format
        const estimatedLines = Math.max(1, Math.ceil(contentLength / 80))
        return Math.max(40, estimatedLines * 24) // 24px per line (1.5em)
      },
      overscan: 10, // Increased overscan for better performance with dynamic heights
      // Enable dynamic measurements
      measureElement: (element) => element.getBoundingClientRect().height,
    })

    // Calculate page breaks based on content height
    const A4_HEIGHT_PX = 11.69 * 96 // 11.69 inches * 96 DPI
    const PAGE_CONTENT_HEIGHT = A4_HEIGHT_PX - (2 * 96) // Minus top and bottom margins (1in each)
    
    // Group items by pages
    const organizeItemsIntoPages = () => {
      const pages: { items: ScriptItem[], height: number }[] = []
      let currentPageHeight = 0
      let currentPageItems: ScriptItem[] = []
      
      items.forEach((item, index) => {
        const estimatedHeight = rowVirtualizer.options.estimateSize(index)
        
        // If adding this item would exceed page height, start a new page
        if (currentPageHeight + estimatedHeight > PAGE_CONTENT_HEIGHT && currentPageItems.length > 0) {
          pages.push({ items: [...currentPageItems], height: currentPageHeight })
          currentPageItems = [item]
          currentPageHeight = estimatedHeight
        } else {
          currentPageItems.push(item)
          currentPageHeight += estimatedHeight
        }
      })
      
      // Add the last page if it has items
      if (currentPageItems.length > 0) {
        pages.push({ items: [...currentPageItems], height: currentPageHeight })
      }
      
      return pages
    }
    
    const pages = organizeItemsIntoPages()

    useImperativeHandle(ref, () => ({
      scrollToIndex: (index: number) => {
        // Find which page contains this index and scroll to it
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
      getScriptContainer: () => scriptContainerRef.current,
    }))

    return (
      <div ref={parentRef} className="flex-1 overflow-auto p-8 bg-gray-100 dark:bg-gray-900">
        {/* Multiple A4 pages */}
        <div className="mx-auto space-y-8">
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
              {/* Page number */}
              <div className="absolute right-4 top-4 text-xs text-gray-400 pointer-events-none">
                Page {pageIndex + 1}
              </div>
              
              {/* Page content */}
              <div className="h-full relative">
                {page.items.map((item, itemIndex) => {
                  const element = item.data
                  const globalIndex = items.findIndex(i => i.data.id === element.id)
                  
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
              
              {/* Page break indicator at bottom */}
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
