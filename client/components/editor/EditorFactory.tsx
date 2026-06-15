"use client"

import dynamic from "next/dynamic"
import { PaneSpinner } from "@/components/shared/PaneSpinner"
import type { FullProject } from "@/services/project"

// Each editor is its own chunk, loaded only for the category being opened.
// Previously every editor (and its heavy export deps — jspdf, fflate, the full
// CodeMirror language-data set) was statically imported, so opening any project
// pulled all of them into one bundle. ssr:false because the editors are
// client-only (CodeMirror, contentEditable) and the desktop build is a static
// export, so there is nothing to render on the server.
const loading = () => <PaneSpinner />

const ScreenplayEditor = dynamic(() => import("./ScreenplayEditor").then((m) => m.ScreenplayEditor), { loading, ssr: false })
const ProseEditor = dynamic(() => import("./ProseEditor").then((m) => m.ProseEditor), { loading, ssr: false })
const PoetryEditor = dynamic(() => import("./PoetryEditor").then((m) => m.PoetryEditor), { loading, ssr: false })
const ComicScriptEditor = dynamic(() => import("./ComicScriptEditor").then((m) => m.ComicScriptEditor), { loading, ssr: false })
const InteractiveFictionEditor = dynamic(() => import("./InteractiveFictionEditor").then((m) => m.InteractiveFictionEditor), { loading, ssr: false })
const TabletopRPGEditor = dynamic(() => import("./TabletopRPGEditor").then((m) => m.TabletopRPGEditor), { loading, ssr: false })
const VaultEditor = dynamic(() => import("./VaultEditor").then((m) => m.VaultEditor), { loading, ssr: false })

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
    case "vault":
      return <VaultEditor projectData={projectData} />
    case "screenplay":
    default:
      return <ScreenplayEditor projectData={projectData} />
  }
}
