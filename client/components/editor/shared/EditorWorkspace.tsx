"use client"

import type { FocusEventHandler, ReactNode, RefObject } from "react"

import type { CaretSubscriber } from "@/hooks/useRealtimePresence"
import { cn } from "@/lib/utils"

import { AIChatPanel } from "../AIChatPanel"
import { RemoteCarets } from "./RemoteCarets"

interface EditorWorkspaceProps {
  children: ReactNode
  surfaceRef: RefObject<HTMLDivElement | null>
  subscribeCarets: (handler: CaretSubscriber) => () => void
  isAIChatOpen: boolean
  onCloseAIChat: () => void
  category?: string
  projectId: string
  currentUnitId?: string
  currentElement?: string
  onToolComplete: () => void
  onSurfaceFocus?: FocusEventHandler<HTMLDivElement>
  /** Keeps the assistant outside the caret coordinate space. */
  separateSurface?: boolean
  surfaceClassName?: string
}

interface EditorAssistantProps {
  isOpen: boolean
  onClose: () => void
  category?: string
  projectId: string
  currentUnitId?: string
  currentElement?: string
  onToolComplete: () => void
}

export function EditorAssistant(props: EditorAssistantProps) {
  return <AIChatPanel {...props} />
}

/** Common writing workspace shared by every document editor. Format adapters
 * supply the actual page/rendering surface while this component owns the
 * assistant and realtime-caret composition around it.
 */
export function EditorWorkspace({
  children,
  surfaceRef,
  subscribeCarets,
  isAIChatOpen,
  onCloseAIChat,
  category,
  projectId,
  currentUnitId,
  currentElement,
  onToolComplete,
  onSurfaceFocus,
  separateSurface = false,
  surfaceClassName,
}: EditorWorkspaceProps) {
  const assistant = (
    <EditorAssistant
      isOpen={isAIChatOpen}
      onClose={onCloseAIChat}
      category={category}
      projectId={projectId}
      currentUnitId={currentUnitId}
      currentElement={currentElement}
      onToolComplete={onToolComplete}
    />
  )

  if (separateSurface) {
    return (
      <div className="flex h-full overflow-hidden">
        <div
          ref={surfaceRef}
          className={cn("relative flex-1 flex flex-col overflow-hidden", surfaceClassName)}
          onFocus={onSurfaceFocus}
        >
          {children}
          <RemoteCarets containerRef={surfaceRef} subscribeCarets={subscribeCarets} />
        </div>
        {assistant}
      </div>
    )
  }

  return (
    <div
      ref={surfaceRef}
      className={cn("relative flex h-full overflow-hidden", surfaceClassName)}
      onFocus={onSurfaceFocus}
    >
      {children}
      {assistant}
      <RemoteCarets containerRef={surfaceRef} subscribeCarets={subscribeCarets} />
    </div>
  )
}
