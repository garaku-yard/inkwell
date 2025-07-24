"use client"

import React, { useRef, useImperativeHandle } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Scene, ScriptElement } from "@/services/project"
import { EditableElement } from "./EditableElement"

// A union type to represent any item in our flattened script list
type ScriptItem = { type: "SCENE_HEADING"; data: Scene } | { type: "ELEMENT"; data: ScriptElement }

interface EditorPaneProps {
  items: ScriptItem[]
  // The type for a ref object that holds a Map.
  elementRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>
  onUpdate: (id: string, content: string, isScene: boolean) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
  activeElementId: string | null // New prop
  setActiveElementId: (id: string | null) => void // New prop
}

export interface EditorPaneRef {
  scrollToIndex: (index: number) => void
}

/**
 * Renders the main screenplay content using a virtualized list.
 * This is the key to handling very long scripts without performance degradation.
 */
export const EditorPane = React.memo(
  React.forwardRef<EditorPaneRef, EditorPaneProps>(
    ({ items, elementRefs, onUpdate, onKeyDown, activeElementId, setActiveElementId }, ref) => {
      const parentRef = useRef<HTMLDivElement>(null)

      // Setup the virtualizer
      const rowVirtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => {
          const item = items[index]
          // This estimate is now just an initial guess.
          // The actual size will be measured and corrected automatically.
          return item.type === "SCENE_HEADING" ? 45 : 40
        },
        overscan: 5,
        // Add a measurement configuration
        measureElement:
          typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
            ? (element) => element.getBoundingClientRect().height
            : undefined,
      })

      useImperativeHandle(ref, () => ({
        scrollToIndex: (index: number) => {
          rowVirtualizer.scrollToIndex(index, { align: "center" })
        },
      }))

      return (
        <div ref={parentRef} className="flex-1 overflow-auto p-8 bg-gray-100 dark:bg-gray-900">
          {/* A4 dimensions: 8.27in x 11.69in. Margins: Left 1.5in, Right 1in, Top 1in, Bottom 1in */}
          <div className="w-[8.27in] min-h-[11.69in] mx-auto bg-white shadow-2xl relative font-mono text-base leading-relaxed pt-[1in] pb-[1in] pr-[1in] pl-[1.5in]">
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const item = items[virtualItem.index]
                const element = item.data

                return (
                  <div
                    // Use virtualItem.key for the key for stability
                    key={virtualItem.key}
                    // This ref is the crucial part. It tells the virtualizer how to measure the element.
                    ref={rowVirtualizer.measureElement}
                    // Add the data-index attribute as is good practice
                    data-index={virtualItem.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <EditableElement
                      ref={(el) => {
                        elementRefs.current.set(element.id, el)
                      }}
                      element={element}
                      onUpdate={onUpdate}
                      onKeyDown={onKeyDown}
                      activeElementId={activeElementId} // Pass activeElementId
                      setActiveElementId={setActiveElementId} // Pass setActiveElementId
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    },
  ),
)

EditorPane.displayName = "EditorPane"
