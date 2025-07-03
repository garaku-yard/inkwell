// client/components/editor/ScreenplayEditor.tsx
"use client"

import React, { useState, useEffect, useRef } from "react"
import Link from "next/link"
// UPDATED: Removed unused imports
import { Download, FileText, Plus, ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toolbar } from "./Toolbar"
// UPDATED: Removed unused 'Act' import and imported the base 'ScriptElement' interface.
import { FullProject, Scene, ScriptElement } from "@/services/project"

// NEW: This is the correct way to get the union type of element strings.
type ScriptElementType = ScriptElement['elementType'];

interface ScreenplayEditorProps {
  projectData: FullProject;
}

const formatElement = (el: ScriptElement, isForEditor: boolean): string => {
  const content = el.content || "";
  switch (el.elementType) {
    case 'ACTION':
      return content;
    case 'CHARACTER':
      return isForEditor ? `\t\t\t${content.toUpperCase()}` : content.toUpperCase();
    case 'PARENTHETICAL':
      return isForEditor ? `\t\t(${content})` : `(${content})`;
    case 'DIALOG':
      return isForEditor ? `\t${content}` : content;
    case 'TRANSITION':
      return isForEditor ? `\t\t\t\t\t${content.toUpperCase()}` : content.toUpperCase();
    case 'SHOT':
      return content;
    default:
      return content;
  }
};

const formatContentForEditor = (project: FullProject): string => {
  if (!project.acts || project.acts.length === 0) {
    return "FADE IN:\n\n";
  }

  return project.acts.map(act => {
    return act.scenes.map(scene => {
      const sceneHeader = scene.setting.toUpperCase();
      const formattedElements = scene.elements.map(el => formatElement(el, true)).join('\n');
      return `${sceneHeader}\n${formattedElements}`;
    }).join('\n\n\n');
  }).join('\n\n\n---\n\n\n');
};

export function ScreenplayEditor({ projectData }: ScreenplayEditorProps) {
  const [content, setContent] = useState<string>("");
  const [activeTab, setActiveTab] = useState("scenes");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContent(formatContentForEditor(projectData));
  }, [projectData]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  }

  // The 'type' parameter is now correctly typed using the derived ScriptElementType.
  const handleInsertElementTemplate = (type: ScriptElementType) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    let template = "";
    switch (type) {
      case 'ACTION':
        template = "\n";
        break;
      case 'CHARACTER':
        template = "\n\n\t\t\tCHARACTER\n\t";
        break;
      case 'PARENTHETICAL':
        template = "\n\t\t()";
        break;
      case 'DIALOG':
        template = "\n\t";
        break;
      case 'TRANSITION':
        template = "\n\n\t\t\t\t\tCUT TO:";
        break;
      case 'SHOT':
        template = "\nSHOT: ";
        break;
    }

    const start = textarea.selectionStart;
    const newText = textarea.value.substring(0, start) + template + textarea.value.substring(start);
    setContent(newText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        let newCursorPos = start + template.length;
        if (type === 'PARENTHETICAL') {
          newCursorPos = start + template.indexOf(')');
        }
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleAddNewScene = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const newSceneTemplate = "\n\n\nINT. NEW LOCATION - DAY\n";

    const newText = textarea.value + newSceneTemplate;
    setContent(newText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
      }
    }, 0);
  }

  const scrollToText = (textToFind: string) => {
    if (!textareaRef.current) return;
    const index = content.indexOf(textToFind);

    if (index !== -1) {
      textareaRef.current.focus();
      const textToLine = textareaRef.current.value.substring(0, index);
      const lines = textToLine.split('\n').length;
      const lineHeight = textareaRef.current.scrollHeight / content.split('\n').length;
      textareaRef.current.scrollTop = Math.max(0, (lines - 5) * lineHeight);
    }
  };

  const allScenes = projectData?.acts?.flatMap(act => act.scenes) || [];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b bg-background z-10">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="mr-2"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <FileText className="h-5 w-5" />
            <h1 className="text-lg font-medium">{projectData.projectName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" />Export</Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r bg-muted/30 flex flex-col">
          <div className="p-4">
            <Button className="w-full justify-start gap-2" variant="outline" onClick={handleAddNewScene}>
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

            <TabsContent value="scenes" className="flex-1 overflow-auto p-2">
              <div className="space-y-1">
                {allScenes.map((scene: Scene) => (
                  <Button key={scene.id} variant="ghost" className="w-full justify-start text-left h-auto" onClick={() => scrollToText(scene.setting.toUpperCase())}>
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">{scene.setting.toUpperCase()}</span>
                      <span className="text-xs text-muted-foreground">{`Scene ${scene.sceneNumber}`}</span>
                    </div>
                  </Button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="structure" className="flex-1 overflow-auto p-4 space-y-4">
              {projectData.acts?.map(act => (
                <div key={act.id}>
                  <h3 className="font-bold text-lg mb-2">Act {act.actNumber} {act.title && `- ${act.title}`}</h3>
                  <div className="space-y-2 pl-2 border-l-2">
                    {act.scenes.map(scene => (
                      <div key={scene.id} className="space-y-1">
                        <p className="text-sm font-semibold hover:text-primary cursor-pointer" onClick={() => scrollToText(scene.setting.toUpperCase())}>
                          {scene.setting.toUpperCase()}
                        </p>
                        <div className="pl-4 space-y-1">
                          {scene.elements.map(el => (
                            <div key={el.id} className="text-xs text-muted-foreground hover:text-primary cursor-pointer truncate" onClick={() => scrollToText(formatElement(el, false))}>
                              <span className="font-bold mr-2">{el.elementType.substring(0, 3)}:</span>
                              <span>{el.content}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* UPDATED: Passing the correct props to the Toolbar component */}
          <Toolbar
            onInsertElementTemplate={handleInsertElementTemplate}
            onAddNewScene={handleAddNewScene}
          />
          <div className="flex-1 overflow-auto p-4 bg-background">
            <div className="max-w-[8.5in] mx-auto bg-white shadow-sm p-16 min-h-full font-mono">
              <Textarea
                ref={textareaRef}
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
