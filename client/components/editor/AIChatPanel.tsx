"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bot, Send, User, Lightbulb, Sparkles, X, BrainCircuit, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { getAvailableAIModels, streamChatCompletion } from "@/services/ai"

interface Message {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
}

interface AIChatPanelProps {
  isOpen: boolean
  onClose: () => void
  currentScene?: string
  currentElement?: string
}

const QUICK_PROMPTS = ["Suggest dialogue for this scene", "Improve this action line", "Add character motivation"]

export const AIChatPanel = React.memo(({ isOpen, onClose }: AIChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "ai",
      content: "Hi! I'm your AI writing assistant. Select a model and ask me anything about your script.",
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>("")

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch available models when the panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()

      const fetchModels = async () => {
        try {
          const data = await getAvailableAIModels()
          const modelNames = data.map((m) => m.name)
          setModels(modelNames)
          if (modelNames.length > 0 && !selectedModel) {
            setSelectedModel(modelNames[0])
          }
        } catch (error) {
          console.error("Could not fetch AI models:", error)
        }
      }
      fetchModels()
    }
  }, [isOpen, selectedModel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])


  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !selectedModel || isTyping) return

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
    const aiResponseShell: Message = {
      id: aiMessageId,
      type: "ai",
      content: "",
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, aiResponseShell])

    try {
      const stream = await streamChatCompletion({
        prompt: content.trim(),
        model: selectedModel,
      })

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
            const parsed = JSON.parse(line)
            if (parsed.response) {
              setMessages((currentMessages) =>
                currentMessages.map((msg) =>
                  msg.id === aiMessageId
                    ? { ...msg, content: msg.content + parsed.response }
                    : msg,
                ),
              )
            }
          } catch (error) {
            console.error("Failed to parse stream chunk:", line, error)
          }
        }
      }
    } catch (error) {
      console.error("Error fetching AI response:", error)
      setMessages((prev) =>
        prev.map((msg) => (msg.id === aiMessageId ? { ...msg, content: "Sorry, I encountered an error." } : msg)),
      )
    } finally {
      setIsTyping(false)
    }
  }

  const handleQuickPrompt = (prompt: string) => {
    setInputValue(prompt)
    inputRef.current?.focus()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(inputValue)
    }
  }

  // --- START OF UI CHANGES ---
  return (
    <div
      className={cn(
        // The background, backdrop-blur, border, and main shadow have been removed from this outer container.
        "h-full flex flex-col",
        "transition-all duration-500 ease-out overflow-hidden",
        isOpen ? "w-[460px] opacity-100" : "w-0 opacity-0",
      )}
    >
      {/* This inner container now provides the "floating card" appearance with its own shadow. */}
      <div
        className={cn(
          "h-full m-4 rounded-2xl flex flex-col",
          "bg-gradient-to-br from-background/98 via-background/95 to-background/98",
          "backdrop-blur-2xl border border-border/40",
          "shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]",
          "hover:shadow-[0_12px_48px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.12)]",
          "transition-shadow duration-300",
          !isOpen && "invisible",
        )}
      >
        {/* The rest of the component's JSX remains the same */}
        <div className={cn("h-full flex flex-col", !isOpen && "invisible")}>
          <div className="relative p-6 border-b border-border/40 flex-shrink-0 space-y-5 overflow-hidden">
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
            <div className="relative flex items-center gap-3 bg-muted/40 backdrop-blur-sm rounded-xl p-3.5 border border-border/30 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="p-1.5 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg">
                <BrainCircuit className="h-4 w-4 text-primary" />
              </div>
              <Select value={selectedModel} onValueChange={setSelectedModel} disabled={models.length === 0}>
                <SelectTrigger className="w-full h-9 text-sm border-0 bg-transparent focus:ring-0 focus:ring-offset-0 font-medium">
                  <SelectValue placeholder={models.length > 0 ? "Select a model..." : "Loading models..."} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model} value={model} className="text-sm font-medium">
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* <div className="p-5 border-b border-border/30 bg-gradient-to-b from-muted/10 to-transparent flex-shrink-0"> */}
          {/*   <div className="flex items-center gap-2.5 mb-3.5"> */}
          {/*     <div className="p-1.5 bg-gradient-to-br from-amber-500/20 to-amber-500/10 rounded-lg"> */}
          {/*       <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> */}
          {/*     </div> */}
          {/*     <span className="text-xs font-bold text-foreground/90 uppercase tracking-wider">Quick Start</span> */}
          {/*   </div> */}
          {/*   <div className="flex flex-wrap gap-2"> */}
          {/*     {QUICK_PROMPTS.map((prompt, index) => ( */}
          {/*       <Button */}
          {/*         key={index} */}
          {/*         variant="outline" */}
          {/*         size="sm" */}
          {/*         className="text-xs h-9 px-4 bg-background/90 hover:bg-primary/10 hover:text-primary hover:border-primary/40 hover:shadow-md hover:scale-105 transition-all duration-200 rounded-xl font-medium" */}
          {/*         onClick={() => handleQuickPrompt(prompt)} */}
          {/*       > */}
          {/*         <Zap className="h-3 w-3 mr-1.5" /> */}
          {/*         {prompt} */}
          {/*       </Button> */}
          {/*     ))} */}
          {/*   </div> */}
          {/* </div> */}
          <ScrollArea className="flex-1 p-5 min-h-0">
            <div className="space-y-7 p-1">
              {messages.map((message) => (
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
              ))}
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
                  onKeyPress={handleKeyPress}
                  placeholder="Ask for writing suggestions..."
                  className="w-full text-sm bg-background/90 border-border/40 h-11 pl-4 pr-4 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                  disabled={isTyping || !selectedModel}
                />
              </div>
              <Button
                size="icon"
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim() || isTyping || !selectedModel}
                className="h-11 w-11 flex-shrink-0 shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 rounded-xl bg-gradient-to-br from-primary to-primary/90"
              >
                <Send className="h-4.5 w-4.5" />
              </Button>
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
