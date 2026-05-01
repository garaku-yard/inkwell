"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Bot, Send, Square, User, Sparkles, X, AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { getStorage } from "@/lib/storage"
import type { AIProviderSettings } from "@/lib/storage"
import { streamChatCompletion } from "@/services/ai"

interface Message {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
}

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

const SELECTION_KEY_PREFIX = "inkwell.ai.selection"

interface StoredSelection {
  providerId: string
  model?: string
}

/** Storage key for a given project's provider selection. Falls back to a
 *  shared global key when the panel is mounted outside any project, so
 *  the selection still persists across sessions. */
function selectionKeyFor(projectId?: string): string {
  return projectId ? `${SELECTION_KEY_PREFIX}.${projectId}` : SELECTION_KEY_PREFIX
}

function readSelection(projectId?: string): StoredSelection | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(selectionKeyFor(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSelection
    if (typeof parsed.providerId !== "string") return null
    return parsed
  } catch {
    return null
  }
}

function writeSelection(projectId: string | undefined, selection: StoredSelection | null) {
  if (typeof window === "undefined") return
  const key = selectionKeyFor(projectId)
  if (selection === null) {
    window.localStorage.removeItem(key)
    return
  }
  window.localStorage.setItem(key, JSON.stringify(selection))
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
  const storage = getStorage()

  const welcome = WELCOME[category ?? ""] ?? "Ask me anything about your writing."
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "ai",
      content: `Hi! I'm your Writing Buddy. ${welcome}`,
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)

  const [providers, setProviders] = useState<AIProviderSettings[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  // Cancel any in-flight stream when the panel unmounts so we don't keep
  // burning tokens / bandwidth after the user has moved on.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const loadProviders = useCallback(async () => {
    try {
      const rows = await storage.ai.listProviderSettings()
      const usable = rows.filter((p) => p.enabled && (p.hasKey || p.kind === "openai_compatible"))
      setProviders(usable)
      const stored = readSelection(projectId)
      const fallback = usable[0]?.id ?? null
      const next =
        stored && usable.some((p) => p.id === stored.providerId)
          ? stored.providerId
          : fallback
      setSelectedId(next)
      if (next && (!stored || stored.providerId !== next)) {
        writeSelection(projectId, { providerId: next })
      }
    } catch {
      setProviders([])
      setSelectedId(null)
    } finally {
      setProvidersLoaded(true)
    }
  }, [storage, projectId])

  useEffect(() => {
    if (isOpen) void loadProviders()
  }, [isOpen, loadProviders])

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedId) ?? null,
    [providers, selectedId],
  )

  const canSend = selectedProvider !== null

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isTyping) return
    if (!selectedProvider) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: content.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsTyping(true)

    const aiMessageId = (Date.now() + 1).toString()
    setMessages((prev) => [
      ...prev,
      { id: aiMessageId, type: "ai", content: "", timestamp: new Date() },
    ])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const request = {
        messages: [...messages, userMessage].map((msg) => ({
          role: (msg.type === "user" ? "user" : "assistant") as "user" | "assistant",
          content: msg.content,
        })),
        providerId: selectedProvider.id,
        model: selectedProvider.defaultModel,
        stream: true,
      }

      const stream = await streamChatCompletion(request, { signal: controller.signal })
      if (!stream) throw new Error("Stream is null")

      const reader = stream.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.trim() === "") continue
          try {
            const parsed = JSON.parse(line) as { response?: string; done?: boolean }
            if (parsed.response) {
              setMessages((currentMessages) =>
                currentMessages.map((msg) =>
                  msg.id === aiMessageId
                    ? { ...msg, content: msg.content + parsed.response }
                    : msg,
                ),
              )
            }
          } catch {
            // Non-JSON line — ignore; upstream parsers can emit framing bytes.
          }
        }
      }
    } catch (error) {
      // Aborts are user-initiated — leave whatever partial response
      // arrived in place rather than overwriting it with an error.
      const aborted =
        (error instanceof DOMException && error.name === "AbortError") ||
        controller.signal.aborted
      if (!aborted) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content: `Sorry — ${(error as Error).message}` }
              : msg,
          ),
        )
      }
    } finally {
      setIsTyping(false)
      abortRef.current = null
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(inputValue)
    }
  }

  const handleSelectProvider = (id: string) => {
    setSelectedId(id)
    writeSelection(projectId, { providerId: id })
  }

  const showEmptyState = providersLoaded && providers.length === 0

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
          <div className="relative p-6 border-b border-border/40 flex-shrink-0 space-y-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="relative p-2.5 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 rounded-2xl ring-1 ring-primary/20 shadow-lg shadow-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full ring-2 ring-background animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-lg tracking-tight">Writing Buddy</h3>
                  <p className="text-xs text-muted-foreground/80 font-medium">Crafting Ideas, One Word at a Time</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 hover:bg-muted/60 hover:rotate-90 transition-all duration-300 rounded-xl"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {providers.length > 0 && (
              <div className="relative">
                <Select value={selectedId ?? undefined} onValueChange={handleSelectProvider}>
                  <SelectTrigger className="h-9 bg-background/70 text-sm">
                    <SelectValue placeholder="Pick a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-medium">{p.label}</span>
                        {p.defaultModel && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {p.defaultModel}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <ScrollArea className="flex-1 p-5 min-h-0">
            <div className="space-y-7 p-1">
              {showEmptyState ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    No AI providers configured yet.
                  </div>
                  <Link
                    href="/settings"
                    className="text-sm font-medium text-primary underline underline-offset-2"
                  >
                    Set one up in Settings → AI Providers
                  </Link>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex gap-3.5 items-start", message.type === "user" ? "justify-end" : "justify-start")}
                  >
                    {message.type === "ai" && (
                      <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-primary/30 shadow-lg shadow-primary/10">
                        <AvatarFallback className="bg-gradient-to-br from-primary/20 via-primary/15 to-primary/10 text-primary">
                          <Bot className="h-4.5 w-4.5" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={cn("flex flex-col gap-2", message.type === "user" ? "items-end" : "items-start")}>
                      <div
                        className={cn(
                          "max-w-[340px] rounded-2xl px-5 py-3.5 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.02]",
                          message.type === "user"
                            ? "bg-gradient-to-br from-primary via-primary/95 to-primary/90 text-primary-foreground rounded-tr-sm shadow-primary/20"
                            : "bg-gradient-to-br from-muted/95 via-muted/90 to-muted/85 border border-border/40 rounded-tl-sm",
                        )}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-line font-medium">{message.content}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 px-2.5 font-semibold tracking-wide">
                        {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {message.type === "user" && (
                      <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-border/40 shadow-lg">
                        <AvatarFallback className="bg-gradient-to-br from-muted via-muted/95 to-muted/90 text-foreground">
                          <User className="h-4.5 w-4.5" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))
              )}
              {isTyping && (
                <div className="flex gap-3.5 items-start justify-start">
                  <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-primary/30 shadow-lg shadow-primary/10">
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 via-primary/15 to-primary/10 text-primary">
                      <Bot className="h-4.5 w-4.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-gradient-to-br from-muted/95 via-muted/90 to-muted/85 border border-border/40 rounded-2xl rounded-tl-sm px-6 py-4 shadow-lg">
                    <div className="flex gap-2">
                      <div
                        className="w-2.5 h-2.5 bg-primary/80 rounded-full animate-bounce shadow-sm"
                        style={{ animationDelay: "0ms", animationDuration: "1s" }}
                      />
                      <div
                        className="w-2.5 h-2.5 bg-primary/80 rounded-full animate-bounce shadow-sm"
                        style={{ animationDelay: "200ms", animationDuration: "1s" }}
                      />
                      <div
                        className="w-2.5 h-2.5 bg-primary/80 rounded-full animate-bounce shadow-sm"
                        style={{ animationDelay: "400ms", animationDuration: "1s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          <div className="p-5 border-t border-border/40 bg-gradient-to-t from-muted/20 via-muted/10 to-transparent flex-shrink-0">
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={
                    showEmptyState
                      ? "Add a provider to start chatting…"
                      : "Ask for writing suggestions..."
                  }
                  className="w-full text-sm bg-background/90 border-border/40 h-11 pl-4 pr-4 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                  disabled={isTyping || !canSend}
                />
              </div>
              {isTyping ? (
                <Button
                  size="icon"
                  onClick={handleStop}
                  className="h-11 w-11 flex-shrink-0 shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 rounded-xl bg-gradient-to-br from-destructive/90 to-destructive"
                  aria-label="Stop response"
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={() => handleSendMessage(inputValue)}
                  disabled={!inputValue.trim() || !canSend}
                  className="h-11 w-11 flex-shrink-0 shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 rounded-xl bg-gradient-to-br from-primary to-primary/90"
                >
                  <Send className="h-4.5 w-4.5" />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Badge
                variant="secondary"
                className="text-xs px-3 py-1.5 bg-gradient-to-r from-primary/15 to-primary/10 text-primary border-primary/30 shadow-sm font-semibold"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
                AI Powered
              </Badge>
              <span className="text-xs text-muted-foreground/60 font-medium">Press Enter to send</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

AIChatPanel.displayName = "AIChatPanel"
