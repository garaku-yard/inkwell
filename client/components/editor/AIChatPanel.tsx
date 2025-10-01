"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bot, Send, User, Lightbulb, Sparkles, X, BrainCircuit } from "lucide-react"
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

const QUICK_PROMPTS = [
  "Suggest dialogue for this scene",
  "Improve this action line",
  "Add character motivation",
]

export const AIChatPanel = React.memo(({ isOpen, onClose }: AIChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "ai",
      content:
        "Hi! I'm your AI writing assistant. Select a model and ask me anything about your script.",
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>("")

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch available models when the panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()

      const fetchModels = async () => {
        try {
          // --- 3. Use the new service function ---
          const data = await getAvailableAIModels()
          const modelNames = data.map(m => m.name)
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

  // Auto-scroll to the bottom of the chat
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
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
      // --- 4. Use the new streaming service function ---
      const stream = await streamChatCompletion({
        prompt: content.trim(),
        model: selectedModel,
      })

      if (!stream) throw new Error("Stream is null")

      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.trim() === "") continue
          try {
            const chunk = JSON.parse(line)
            if (chunk.response) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === aiMessageId ? { ...msg, content: msg.content + chunk.response } : msg
                )
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
        prev.map((msg) =>
          msg.id === aiMessageId ? { ...msg, content: "Sorry, I encountered an error." } : msg
        )
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

  if (!isOpen) return null

  // --- The JSX for the return() statement remains exactly the same ---
  return (
    <div className="w-80 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-muted/30 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">AI Writing Assistant</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Model Selector Dropdown */}
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedModel} onValueChange={setSelectedModel} disabled={models.length === 0}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder={models.length > 0 ? "Select a model..." : "Loading models..."} />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model} value={model} className="text-xs">
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="p-3 border-b bg-muted/10 flex-shrink-0">
        <div className="flex items-center gap-1 mb-2">
          <Lightbulb className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Quick suggestions</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_PROMPTS.map((prompt, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 bg-background/50 hover:bg-primary/10 hover:text-primary hover:border-primary/20"
              onClick={() => handleQuickPrompt(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3 min-h-0" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex gap-2", message.type === "user" ? "justify-end" : "justify-start")}
            >
              {message.type === "ai" && (
                <Avatar className="h-7 w-7 mt-1 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}

              <div className={cn("max-w-[85%] space-y-2", message.type === "user" ? "order-1" : "order-2")}>
                <Card
                  className={cn(
                    "shadow-sm",
                    message.type === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50 border-border/50",
                  )}
                >
                  <CardContent className="p-3">
                    <p className="text-sm leading-relaxed whitespace-pre-line">{message.content}</p>
                  </CardContent>
                </Card>

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>{message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>

              {message.type === "user" && (
                <Avatar className="h-7 w-7 mt-1 flex-shrink-0 order-2">
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {isTyping && messages[messages.length - 1]?.type === 'ai' && messages[messages.length - 1]?.content === '' && (
            <div className="flex gap-2 justify-start">
              <Avatar className="h-7 w-7 mt-1 flex-shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <Card className="bg-muted/50 border-border/50 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1">
                    <div className="flex gap-1">
                      <div
                        className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t bg-muted/10 flex-shrink-0">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask for writing suggestions..."
            className="flex-1 text-sm bg-background"
            disabled={isTyping || !selectedModel}
          />
          <Button
            size="icon"
            onClick={() => handleSendMessage(inputValue)}
            disabled={!inputValue.trim() || isTyping || !selectedModel}
            className="h-9 w-9 flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Badge variant="secondary" className="text-xs bg-background/50">
            <Sparkles className="h-3 w-3 mr-1" />
            AI Assistant
          </Badge>
          <span className="text-xs text-muted-foreground">Press Enter to send</span>
        </div>
      </div>
    </div>
  )
})

AIChatPanel.displayName = "AIChatPanel"
