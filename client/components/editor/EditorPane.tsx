"use client"

import React, { useRef, useImperativeHandle } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Scene, ScriptElement } from "@/services/project"
import { EditableElement } from "./EditableElement"
import { type ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"

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
}

export const EditorPane = React.memo(
  React.forwardRef<EditorPaneRef, EditorPaneProps>(
    (props, ref) => {
      const { items, elementRefs, onContentChange, onFinalizeUpdate, onKeyDown, activeElementId, onFocus, onBlur } = props
      const parentRef = useRef<HTMLDivElement>(null)

      const rowVirtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 40,
        overscan: 5,
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
          <div className="w-[8.27in] min-h-[11.69in] mx-auto bg-white dark:bg-gray-800 shadow-2xl relative font-mono text-base leading-relaxed pt-[1in] pb-[1in] pr-[1in] pl-[1.5in]">
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
                    key={virtualItem.key}
                    ref={rowVirtualizer.measureElement}
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
          </div>
        </div>
      )
    },
  ),
)

EditorPane.displayName = "EditorPane"
