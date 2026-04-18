export interface SectionMarker {
  name: string
  /** Position as a fraction of totalUnits (0–100 scale maps to 0%–100%). */
  unit: number
  color: string
}

export interface CategoryStructure {
  /** Singular label for one unit on the timeline axis (e.g. "page", "chapter"). */
  unitLabel: string
  unitLabelPlural: string
  /** Short prefix for axis ticks (e.g. "Pg." "Ch." "St."). */
  unitAbbr: string
  /** Default total number of units for a new project of this category. */
  totalUnits: number
  /** Named structural divisions shown as coloured markers on the timeline. */
  sections: SectionMarker[]
  /** Label for a single beat card. */
  beatLabel: string
  beatLabelPlural: string
  /** Label for the timeline panel header. */
  structureLabel: string
}

const STRUCTURES: Record<string, CategoryStructure> = {
  screenplay: {
    unitLabel: "page",
    unitLabelPlural: "pages",
    unitAbbr: "Pg.",
    totalUnits: 120,
    beatLabel: "Beat",
    beatLabelPlural: "Beats",
    structureLabel: "Story Structure",
    sections: [
      { name: "Act 1 — Setup",        unit: 1,  color: "#10b981" },
      { name: "Act 2 — Confrontation", unit: 30, color: "#8b5cf6" },
      { name: "Act 3 — Resolution",    unit: 90, color: "#ef4444" },
    ],
  },
  novel: {
    unitLabel: "chapter",
    unitLabelPlural: "chapters",
    unitAbbr: "Ch.",
    totalUnits: 30,
    beatLabel: "Chapter",
    beatLabelPlural: "Chapters",
    structureLabel: "Story Structure",
    sections: [
      { name: "Part 1 — Beginning", unit: 1,  color: "#10b981" },
      { name: "Part 2 — Middle",    unit: 8,  color: "#8b5cf6" },
      { name: "Part 3 — End",       unit: 22, color: "#ef4444" },
    ],
  },
  memoir: {
    unitLabel: "chapter",
    unitLabelPlural: "chapters",
    unitAbbr: "Ch.",
    totalUnits: 25,
    beatLabel: "Memory",
    beatLabelPlural: "Memories",
    structureLabel: "Story Structure",
    sections: [
      { name: "Part 1 — Before",  unit: 1,  color: "#10b981" },
      { name: "Part 2 — During",  unit: 7,  color: "#8b5cf6" },
      { name: "Part 3 — After",   unit: 18, color: "#ef4444" },
    ],
  },
  comic: {
    unitLabel: "page",
    unitLabelPlural: "pages",
    unitAbbr: "Pg.",
    totalUnits: 24,
    beatLabel: "Scene",
    beatLabelPlural: "Scenes",
    structureLabel: "Issue Structure",
    sections: [
      { name: "Issue 1 — Hook",       unit: 1,  color: "#10b981" },
      { name: "Issue 2 — Rising",     unit: 8,  color: "#8b5cf6" },
      { name: "Issue 3 — Climax",     unit: 18, color: "#ef4444" },
    ],
  },
  poetry: {
    unitLabel: "stanza",
    unitLabelPlural: "stanzas",
    unitAbbr: "St.",
    totalUnits: 20,
    beatLabel: "Stanza",
    beatLabelPlural: "Stanzas",
    structureLabel: "Poem Structure",
    sections: [
      { name: "Section 1 — Opening",  unit: 1,  color: "#10b981" },
      { name: "Section 2 — Body",     unit: 5,  color: "#8b5cf6" },
      { name: "Section 3 — Closing",  unit: 16, color: "#ef4444" },
    ],
  },
  lyrics: {
    unitLabel: "section",
    unitLabelPlural: "sections",
    unitAbbr: "§",
    totalUnits: 12,
    beatLabel: "Section",
    beatLabelPlural: "Sections",
    structureLabel: "Song Structure",
    sections: [
      { name: "Intro / Verse",  unit: 1,  color: "#10b981" },
      { name: "Chorus",         unit: 4,  color: "#8b5cf6" },
      { name: "Bridge / Outro", unit: 9,  color: "#ef4444" },
    ],
  },
  interactive_fiction: {
    unitLabel: "passage",
    unitLabelPlural: "passages",
    unitAbbr: "Ps.",
    totalUnits: 40,
    beatLabel: "Node",
    beatLabelPlural: "Nodes",
    structureLabel: "Story Map",
    sections: [
      { name: "Chapter 1 — Introduction", unit: 1,  color: "#10b981" },
      { name: "Chapter 2 — Exploration",  unit: 10, color: "#8b5cf6" },
      { name: "Chapter 3 — Resolution",   unit: 28, color: "#ef4444" },
    ],
  },
  ttrpg: {
    unitLabel: "entry",
    unitLabelPlural: "entries",
    unitAbbr: "§",
    totalUnits: 50,
    beatLabel: "Entry",
    beatLabelPlural: "Entries",
    structureLabel: "Book Structure",
    sections: [
      { name: "Part 1 — Introduction", unit: 1,  color: "#10b981" },
      { name: "Part 2 — Core Rules",   unit: 12, color: "#8b5cf6" },
      { name: "Part 3 — Adventures",   unit: 35, color: "#ef4444" },
    ],
  },
}

const DEFAULT_STRUCTURE = STRUCTURES.screenplay

export function getCategoryStructure(category?: string | null): CategoryStructure {
  return STRUCTURES[category ?? ""] ?? DEFAULT_STRUCTURE
}
