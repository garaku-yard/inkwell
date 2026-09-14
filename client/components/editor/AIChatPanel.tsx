"use client"

import React, { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import { AgentChangesDialog } from "./AgentChangesDialog"
import { AIChatComposer } from "./ai-chat/AIChatComposer"
import { AIChatHeader } from "./ai-chat/AIChatHeader"
import { AIChatMessages } from "./ai-chat/AIChatMessages"
import { useAIChatStream, type ChatMessage } from "./ai-chat/useAIChatStream"
import { useAIProviders } from "./ai-chat/useAIProviders"

const WELCOME: Record<string, string> = {
  screenplay:           "Ask me anything about your script — scenes, dialogue, structure.",
  novel:                "Ask me anything about your novel — characters, plot, prose.",
  memoir:               "Ask me anything about your memoir — voice, structure, memory.",
  poetry:               "Ask me anything about your poem — form, imagery, rhythm.",
  lyrics:               "Ask me anything about your song — lyrics, rhyme, hook.",
  comic:                "Ask me anything about your comic — panels, dialogue, pacing.",
  interactive_fiction:  "Ask me anything about your story — branches, choices, world.",
  ttrpg:                "Ask me anything about your game — rules, lore, encounters.",
}

interface AIChatPanelProps {
  isOpen: boolean
  onClose: () => void
  category?: string
  projectId?: string
  currentScene?: string
  currentElement?: string
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void
}

export const AIChatPanel = React.memo(({ isOpen, onClose, category, projectId, currentScene, onToolComplete }: AIChatPanelProps) => {
  const welcome = WELCOME[category ?? ""] ?? "Ask me anything about your writing."
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      type: "ai",
      content: `Hi! I'm your Writing Buddy. ${welcome}`,
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [showChanges, setShowChanges] = useState(false)

  // "Don't ask again for this tool" is scoped to the project's chat, so leaving
  // the project has to end it — otherwise a standing allowance granted for one
  // manuscript would quietly outlive the conversation that granted it.
  useEffect(() => {
    if (!projectId) return
    return () => {
      void import("@/lib/storage/local/tools")
        .then(({ chatScope, clearApprovalScope }) => clearApprovalScope(chatScope(projectId)))
        .catch(() => {})
    }
  }, [projectId])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    providers,
    providersLoaded,
    selectedProvider,
    selectedId,
    selectProvider,
  } = useAIProviders(projectId, isOpen)

  const { sendMessage, stop, decideApproval } = useAIChatStream({
    selectedProvider,
    setMessages,
    setIsTyping,
    isTyping,
    projectId,
    activeSceneId: currentScene,
    category,
    onToolComplete,
  })

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const canSend = selectedProvider !== null
  const showEmptyState = providersLoaded && providers.length === 0

  const handleSend = () => {
    if (!inputValue.trim()) return
    const content = inputValue
    setInputValue("")
    void sendMessage(content, messages)
  }

  return (
    <div
      className={cn(
        "h-full flex flex-col border-l bg-background",
        "transition-all duration-300 ease-out overflow-hidden",
        isOpen ? "w-[420px]" : "w-0",
      )}
    >
      {/* Fixed inner width so the content doesn't squish during the
          width-collapse animation; hidden once fully closed. */}
      <div className={cn("flex h-full w-[420px] flex-col", !isOpen && "invisible")}>
        <AIChatHeader
          providers={providers}
          selectedId={selectedId}
          onSelect={selectProvider}
          onClose={onClose}
          onShowChanges={projectId ? () => setShowChanges(true) : undefined}
        />
        <AIChatMessages
          ref={messagesEndRef}
          messages={messages}
          isTyping={isTyping}
          showEmptyState={showEmptyState}
          onApprovalDecision={(messageId, checkpointId, tool, args, decision) => void decideApproval(messageId, checkpointId, tool, args, decision)}
          category={category}
        />
        <AIChatComposer
          ref={inputRef}
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          onStop={stop}
          isTyping={isTyping}
          canSend={canSend}
          emptyState={showEmptyState}
          providerLabel={selectedProvider?.label}
        />
      </div>
      {projectId && (
        <AgentChangesDialog
          projectId={projectId}
          open={showChanges}
          onOpenChange={setShowChanges}
        />
      )}
    </div>
  )
})

AIChatPanel.displayName = "AIChatPanel"
