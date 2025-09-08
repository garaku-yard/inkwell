"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Bot, Send, User, Lightbulb, Sparkles, X, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface Message {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
  suggestions?: string[]
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
  "Create scene transition",
  "Develop conflict",
  "Add subtext to dialogue",
]

const MOCK_RESPONSES = [
  "Here are some suggestions to enhance your scene:\n\n• Consider adding more visual details to help the reader visualize the setting\n• The dialogue could benefit from more subtext - what are the characters not saying?\n• Try varying sentence length in action lines for better pacing",
  "For this dialogue, you might want to:\n\n• Give each character a distinct voice and speech pattern\n• Add interruptions or overlapping dialogue for realism\n• Consider what the character wants vs. what they're actually saying",
  "To strengthen this action sequence:\n\n• Use active voice instead of passive\n• Break up long paragraphs into shorter, punchier lines\n• Focus on the most important visual elements",
  "Character development suggestions:\n\n• What's driving this character's actions in this moment?\n• How does their background influence their choices?\n• Consider adding a small gesture or habit that reveals personality",
]

export const AIChatPanel = React.memo(({ isOpen, onClose, currentScene, currentElement }: AIChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "ai",
      content:
        "Hi! I'm your AI writing assistant. I can help you improve your screenplay with suggestions for dialogue, action lines, character development, and more. What would you like to work on?",
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages])

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: content.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsTyping(true)

    // Simulate AI response delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const aiResponse: Message = {
      id: (Date.now() + 1).toString(),
      type: "ai",
      content: MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)],
      timestamp: new Date(),
      suggestions:
        Math.random() > 0.5
          ? ["Try this alternative approach", "Consider this character angle", "Add this visual element"]
          : undefined,
    }

    setMessages((prev) => [...prev, aiResponse])
    setIsTyping(false)
  }

  const handleQuickPrompt = (prompt: string) => {
    handleSendMessage(prompt)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(inputValue)
    }
  }

  if (!isOpen) return null

  return (
    <div className="w-80 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-muted/30 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
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
        <p className="text-xs text-muted-foreground">Get suggestions and improve your screenplay</p>
      </div>

      {/* Quick Prompts */}
      <div className="p-3 border-b bg-muted/10 flex-shrink-0">
        <div className="flex items-center gap-1 mb-2">
          <Lightbulb className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Quick suggestions</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_PROMPTS.slice(0, 3).map((prompt, index) => (
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

                {message.suggestions && (
                  <div className="space-y-1">
                    {message.suggestions.map((suggestion, index) => (
                      <Button
                        key={index}
                        variant="ghost"
                        size="sm"
                        className="h-auto p-2 text-xs text-left justify-start w-full bg-muted/30 hover:bg-muted/50"
                        onClick={() => handleSendMessage(suggestion)}
                      >
                        <ChevronRight className="h-3 w-3 mr-1 flex-shrink-0" />
                        <span className="truncate">{suggestion}</span>
                      </Button>
                    ))}
                  </div>
                )}

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

          {isTyping && (
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
                    <span className="text-xs text-muted-foreground ml-2">AI is thinking...</span>
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
            disabled={isTyping}
          />
          <Button
            size="icon"
            onClick={() => handleSendMessage(inputValue)}
            disabled={!inputValue.trim() || isTyping}
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
