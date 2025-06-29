// client/components/editor/ScreenplayEditor.tsx
"use client"

import type React from "react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { Download, FileText, Plus, Settings, ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Toolbar } from "./Toolbar" // Adjust path if needed
import { FullProject, Scene } from "@/services/project" // Import the types

// The component now receives the full project data as a prop.
interface ScreenplayEditorProps {
  projectData: FullProject;
}

// Helper function to generate the editor content from the project data
const generateContentFromProject = (project: FullProject): string => {
  // Defensive check: If there are no acts or acts is null, return a default starting point.
  if (!project.acts || project.acts.length === 0) {
    return "FADE IN:\n\n";
  }

  // Combine all elements from all scenes into one string for the main editor
  return project.acts
    .flatMap(act => act.scenes)
    .flatMap(scene => [
      scene.setting.toUpperCase(),
      ...scene.elements.map(el => {
        // This logic can be expanded to format each element type correctly.
        switch (el.elementType) {
          case 'CHARACTER': return el.content.toUpperCase();
          case 'PARENTHETICAL': return `  (${el.content})`; // Parentheticals are usually wrapped in parens
          case 'DIALOG': return `    ${el.content}`;
          default: return el.content;
        }
      })
    ].join('\n\n'))
    .join('\n\n\n'); // Use triple newline to separate scenes clearly
}


export function ScreenplayEditor({ projectData }: ScreenplayEditorProps) {

  const [content, setContent] = useState<string>("");
  const [activeTab, setActiveTab] = useState("scenes");

  // When the projectData prop is loaded, generate the initial editor content.
  useEffect(() => {
    if (projectData) {
      setContent(generateContentFromProject(projectData));
    }
  }, [projectData]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // TODO: Implement saving logic here. This should probably be debounced
    // to avoid sending too many API requests as the user types.
    setContent(e.target.value)
  }

  // A helper to safely get all scenes for rendering, even if acts is null or empty.
  const allScenes = projectData?.acts?.flatMap(act => act.scenes) || [];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b bg-background z-10">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="mr-2">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <FileText className="h-5 w-5" />
            <h1 className="text-lg font-medium">{projectData.projectName}</h1>
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
        {/* Sidebar */}
        <div className="w-64 border-r bg-muted/30 flex flex-col">
          <div className="p-4">
            <Button className="w-full justify-start gap-2" variant="outline">
              <Plus className="h-4 w-4" />
              New Scene
            </Button>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="px-4">
              <TabsList className="w-full">
                <TabsTrigger value="scenes" className="flex-1">Scenes</TabsTrigger>
                <TabsTrigger value="structure" className="flex-1">Structure</TabsTrigger>
              </TabsList>
            </div>
            {/* Render the scene list dynamically */}
            <TabsContent value="scenes" className="flex-1 overflow-auto p-2">
              <div className="space-y-1">
                {allScenes.length > 0 ? allScenes.map((scene: Scene) => (
                  <Button key={scene.id} variant="ghost" className="w-full justify-start text-left h-auto">
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">{`SC. ${scene.sceneNumber}`}</span>
                      <span className="text-xs text-muted-foreground">{scene.setting}</span>
                    </div>
                  </Button>
                )) : (
                  <p className="p-4 text-sm text-muted-foreground">No scenes yet.</p>
                )}
              </div>
            </TabsContent>
            {/* Render the act structure dynamically */}
            <TabsContent value="structure" className="flex-1 overflow-auto p-4 space-y-4">
              {projectData.acts && projectData.acts.length > 0 ? projectData.acts.map(act => (
                <div key={act.id}>
                  <h3 className="font-bold text-lg mb-2">Act {act.actNumber}</h3>
                  <div className="space-y-1 pl-2 border-l-2">
                    {act.scenes.map(scene => (
                      <p key={scene.id} className="text-sm text-muted-foreground">{`SC. ${scene.sceneNumber}: ${scene.setting}`}</p>
                    ))}
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No acts yet.</p>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Toolbar />
          <div className="flex-1 overflow-auto p-4 bg-background">
            <div className="max-w-[8.5in] mx-auto bg-white shadow-sm p-16 min-h-full font-mono">
              <Textarea
                value={content}
                onChange={handleContentChange}
                className="text-base leading-relaxed resize-none border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-full min-h-[calc(100vh-12rem)]"
                placeholder="Start writing your screenplay..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
