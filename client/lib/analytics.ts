import type { FullProject } from "@/services/project"

export interface CharacterStats {
  name: string
  lines: number
  words: number
  wordsPerLine: number
  distinctWords: number
  percentage: number
}

export interface SceneStats {
  id: string
  index: number
  heading: string
  location: string
  intOrExt: string
  timeOfDay: string
  elementCount: number
  dialogueLines: number
  actionWords: number
  characters: string[]
  wordCount: number
}

export interface ScriptAnalytics {
  projectTitle: string
  category: string
  totalScenes: number
  totalWords: number
  totalDialogueLines: number
  totalActionWords: number
  dialogueRatio: number
  intScenes: number
  extScenes: number
  characters: CharacterStats[]
  scenes: SceneStats[]
  pacingData: Array<{ scene: number; words: number; name: string }>
  conflictData: Array<{ scene: number; intensity: number; name: string }>
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function countDistinctWords(text: string): number {
  return new Set(
    text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean)
  ).size
}

function parseSceneHeading(heading: string): { intOrExt: string; location: string; timeOfDay: string } {
  const upper = heading.toUpperCase()
  let intOrExt = ""
  if (upper.startsWith("INT./EXT.") || upper.startsWith("INT/EXT")) intOrExt = "INT/EXT"
  else if (upper.startsWith("EXT./INT.") || upper.startsWith("EXT/INT")) intOrExt = "EXT/INT"
  else if (upper.startsWith("INT.") || upper.startsWith("INT ")) intOrExt = "INT"
  else if (upper.startsWith("EXT.") || upper.startsWith("EXT ")) intOrExt = "EXT"

  const withoutPrefix = heading.replace(/^(INT\.|EXT\.|INT\/EXT\.|EXT\/INT\.)\s*/i, "")
  const dashParts = withoutPrefix.split(" - ")
  const location = dashParts[0]?.trim() || heading
  const timeOfDay = dashParts[1]?.trim() || ""

  return { intOrExt, location, timeOfDay }
}

export function computeAnalytics(project: FullProject): ScriptAnalytics {
  const scenes = project.scenes || []
  const allElements = scenes.flatMap(s => s.elements || [])

  const dialogueElements = allElements.filter(e => e.element_type === "dialogue")
  const actionElements = allElements.filter(e => e.element_type === "action")

  const totalDialogueLines = dialogueElements.length
  const totalActionWords = actionElements.reduce((sum, e) => sum + countWords(e.content), 0)
  const totalWords = allElements.reduce((sum, e) => sum + countWords(e.content), 0)

  const totalSpeechActionCount = totalDialogueLines + actionElements.length
  const dialogueRatio = totalSpeechActionCount > 0
    ? Math.round((totalDialogueLines / totalSpeechActionCount) * 100)
    : 0

  // Build character -> dialogue mapping
  const characterMap = new Map<string, { lines: number; allWords: string }>()

  for (const scene of scenes) {
    const elements = scene.elements || []
    let currentChar: string | null = null

    for (const el of elements) {
      if (el.element_type === "character") {
        currentChar = el.content.trim().toUpperCase()
        if (!characterMap.has(currentChar)) {
          characterMap.set(currentChar, { lines: 0, allWords: "" })
        }
      } else if (el.element_type === "dialogue" && currentChar) {
        const stats = characterMap.get(currentChar)!
        stats.lines++
        stats.allWords += " " + el.content
      } else if (el.element_type !== "parenthetical") {
        currentChar = null
      }
    }
  }

  const characters: CharacterStats[] = Array.from(characterMap.entries())
    .map(([name, stats]) => {
      const words = countWords(stats.allWords)
      return {
        name,
        lines: stats.lines,
        words,
        wordsPerLine: stats.lines > 0 ? Math.round((words / stats.lines) * 10) / 10 : 0,
        distinctWords: countDistinctWords(stats.allWords),
        percentage: totalDialogueLines > 0
          ? Math.round((stats.lines / totalDialogueLines) * 100)
          : 0,
      }
    })
    .filter(c => c.lines > 0)
    .sort((a, b) => b.lines - a.lines)

  let intScenes = 0
  let extScenes = 0

  const sceneStats: SceneStats[] = scenes.map((scene, index) => {
    const elements = scene.elements || []
    const { intOrExt, location, timeOfDay } = parseSceneHeading(scene.scene_heading)

    if (intOrExt.includes("INT")) intScenes++
    if (intOrExt.includes("EXT")) extScenes++

    const sceneChars = elements
      .filter(e => e.element_type === "character")
      .map(e => e.content.trim().toUpperCase())

    return {
      id: scene.id,
      index: index + 1,
      heading: scene.scene_heading,
      location,
      intOrExt,
      timeOfDay,
      elementCount: elements.length,
      dialogueLines: elements.filter(e => e.element_type === "dialogue").length,
      actionWords: elements
        .filter(e => e.element_type === "action")
        .reduce((sum, e) => sum + countWords(e.content), 0),
      characters: [...new Set(sceneChars)],
      wordCount: elements.reduce((sum, e) => sum + countWords(e.content), 0),
    }
  })

  const maxWords = Math.max(...sceneStats.map(s => s.wordCount), 1)
  const pacingData = sceneStats.map(s => ({
    scene: s.index,
    words: Math.round((s.wordCount / maxWords) * 100),
    name: s.location || s.heading,
  }))

  // Conflict proxy: dialogue density (dialogue lines / total elements)
  const conflictData = sceneStats.map(s => ({
    scene: s.index,
    intensity: s.elementCount > 0
      ? Math.round((s.dialogueLines / s.elementCount) * 100)
      : 0,
    name: s.location || s.heading,
  }))

  return {
    projectTitle: project.title,
    category: project.category,
    totalScenes: scenes.length,
    totalWords,
    totalDialogueLines,
    totalActionWords,
    dialogueRatio,
    intScenes,
    extScenes,
    characters,
    scenes: sceneStats,
    pacingData,
    conflictData,
  }
}
