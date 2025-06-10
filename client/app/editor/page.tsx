"use client"

import type React from "react"
import Link from "next/link"

import { useState } from "react"
import { Download, FileText, Plus, Settings, ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { FormatToolbar } from "../editor/toolbar"


export default function ScreenplayEditor() {
  const [content, setContent] = useState<string>(
    "FADE IN:\n\nEXT. CITY STREET - DAY\n\nA busy downtown street. People hurry past each other, lost in their own worlds.\n\nJANE (30s, confident) strides purposefully through the crowd.\n\nJANE\n(into phone)\nI'll be there in five minutes. Don't start without me.\n\nShe hangs up and quickens her pace.",
  )

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
  }

  const projectTitle = "Untitled Screenplay"

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b bg-background z-10">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon"  className="mr-2">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <FileText className="h-5 w-5" />
            <h1 className="text-lg font-medium">{projectTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 border-r bg-muted/30 flex flex-col">
          <div className="p-4">
            <Button className="w-full justify-start gap-2" variant="outline">
              <Plus className="h-4 w-4" />
              New Scene
            </Button>
          </div>
          <Tabs defaultValue="scenes" className="flex-1 flex flex-col">
            <div className="px-4">
              <TabsList className="w-full">
                <TabsTrigger value="scenes" className="flex-1">
                  Scenes
                </TabsTrigger>
                <TabsTrigger value="structure" className="flex-1">
                  Structure
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="scenes" className="flex-1 overflow-auto p-2">
            </TabsContent>
            <TabsContent value="structure" className="flex-1 overflow-auto p-4">
              <div className="text-sm text-muted-foreground">
                <p>Structure tools coming soon...</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <FormatToolbar />
          <div className="flex-1 overflow-auto p-4 bg-background">
            <div className="max-w-[8.5in] mx-auto bg-white shadow-sm p-8 min-h-full">
              <Textarea
                value={content}
                onChange={handleContentChange}
                className="font-mono text-base leading-relaxed resize-none border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-full min-h-[calc(100vh-12rem)]"
                placeholder="Start writing your screenplay..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
