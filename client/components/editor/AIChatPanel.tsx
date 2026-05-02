"use client"

import React, { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

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
}

export const AIChatPanel = React.memo(({ isOpen, onClose, category, projectId }: AIChatPanelProps) => {
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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    providers,
    providersLoaded,
    selectedProvider,
    selectedId,
    selectProvider,
  } = useAIProviders(projectId, isOpen)

  const { sendMessage, stop } = useAIChatStream({
    selectedProvider,
    setMessages,
    setIsTyping,
    isTyping,
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
        "h-full flex flex-col border-l border-border/40 bg-background",
        "transition-all duration-300 ease-out overflow-hidden",
        isOpen ? "w-[420px]" : "w-0",
      )}
    >
      <div className="h-[57px] flex-shrink-0 border-b border-border/40" />

      <div
        className={cn(
          "flex-1 flex flex-col border-t border-border/40",
          !isOpen && "invisible",
        )}
      >
        <div className={cn("flex-1 flex flex-col", !isOpen && "invisible")}>
          <AIChatHeader
            providers={providers}
            selectedId={selectedId}
            onSelect={selectProvider}
            onClose={onClose}
          />
          <AIChatMessages
            ref={messagesEndRef}
            messages={messages}
            isTyping={isTyping}
            showEmptyState={showEmptyState}
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
      </div>
    </div>
  )
})

AIChatPanel.displayName = "AIChatPanel"
