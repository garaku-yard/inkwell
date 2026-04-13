"use client"

import { ScreenplayEditor } from "./ScreenplayEditor"
import { ProseEditor } from "./ProseEditor"
import { PoetryEditor } from "./PoetryEditor"
import { ComicScriptEditor } from "./ComicScriptEditor"
import { InteractiveFictionEditor } from "./InteractiveFictionEditor"
import { TabletopRPGEditor } from "./TabletopRPGEditor"
import type { FullProject } from "@/services/project"

interface EditorFactoryProps {
  projectData: FullProject
}

export function EditorFactory({ projectData }: EditorFactoryProps) {
  switch (projectData.category) {
    case "novel":
    case "memoir":
      return <ProseEditor projectData={projectData} />
    case "poetry":
    case "lyrics":
      return <PoetryEditor projectData={projectData} />
    case "comic_script":
      return <ComicScriptEditor projectData={projectData} />
    case "interactive_fiction":
      return <InteractiveFictionEditor projectData={projectData} />
    case "tabletop_rpg":
      return <TabletopRPGEditor projectData={projectData} />
    case "screenplay":
    default:
      return <ScreenplayEditor projectData={projectData} />
  }
}
