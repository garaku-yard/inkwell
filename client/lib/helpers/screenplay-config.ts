import { Clapperboard, User, MessageSquare, Parentheses, ArrowRight, Camera, MapPinned } from "lucide-react"

export const SCRIPT_ELEMENT_CONFIG = {
  SCENE_HEADING: {
    tooltip: "Scene",
    toolbarColor: "hover:bg-green-50 hover:text-green-700",
    icon: MapPinned,
    editorClasses: "uppercase font-bold",
  },
  ACTION: {
    tooltip: "Action",
    icon: Clapperboard,
    toolbarColor: "hover:bg-purple-50 hover:text-purple-700",
    badgeColor: "bg-purple-100 text-purple-700 border-purple-200",
    editorClasses: "w-full",
  },
  CHARACTER: {
    tooltip: "Character",
    icon: User,
    toolbarColor: "hover:bg-blue-50 hover:text-blue-700",
    badgeColor: "bg-blue-100 text-blue-700 border-blue-200",
    editorClasses: "text-center uppercase",
  },
  DIALOG: {
    tooltip: "Dialogue",
    icon: MessageSquare,
    toolbarColor: "hover:bg-green-50 hover:text-green-700",
    badgeColor: "bg-green-100 text-green-700 border-green-200",
    editorClasses: "ml-[1.0in] mr-[1.0in]",
  },
  PARENTHETICAL: {
    tooltip: "Parenthetical",
    icon: Parentheses,
    toolbarColor: "hover:bg-gray-50 hover:text-gray-700",
    badgeColor: "bg-gray-100 text-gray-700 border-gray-200",
    editorClasses: "ml-[1.6in] mr-[1.6in] text-sm text-gray-500",
  },
  TRANSITION: {
    tooltip: "Transition",
    icon: ArrowRight,
    toolbarColor: "hover:bg-red-50 hover:text-red-700",
    badgeColor: "bg-red-100 text-red-700 border-red-200",
    editorClasses: "uppercase text-right",
  },
  SHOT: {
    tooltip: "Shot",
    icon: Camera,
    toolbarColor: "hover:bg-orange-50 hover:text-orange-700",
    badgeColor: "bg-orange-100 text-orange-700 border-orange-200",
    editorClasses: "uppercase",
  },
} as const

export type ToolbarScriptElementType = keyof Omit<typeof SCRIPT_ELEMENT_CONFIG, "SCENE_HEADING">
