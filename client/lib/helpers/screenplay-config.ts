import { Clapperboard, User, MessageSquare, Parentheses, ArrowRight, Camera } from "lucide-react";

export const SCRIPT_ELEMENT_CONFIG = {
  SCENE_HEADING: {
    editorClasses: "uppercase font-bold my-4",
  },
  ACTION: {
    tooltip: "Action",
    icon: Clapperboard,
    toolbarColor: "hover:bg-purple-50 hover:text-purple-700",
    badgeColor: "bg-purple-100 text-purple-700 border-purple-200",
    editorClasses: "my-2",
  },
  CHARACTER: {
    tooltip: "Character",
    icon: User,
    toolbarColor: "hover:bg-blue-50 hover:text-blue-700",
    badgeColor: "bg-blue-100 text-blue-700 border-blue-200",
    editorClasses: "mt-4 mb-1 text-center",
  },
  DIALOG: {
    tooltip: "Dialogue",
    icon: MessageSquare,
    toolbarColor: "hover:bg-green-50 hover:text-green-700",
    badgeColor: "bg-green-100 text-green-700 border-green-200",
    editorClasses: "mx-auto w-[65%]",
  },
  PARENTHETICAL: {
    tooltip: "Parenthetical",
    icon: Parentheses,
    toolbarColor: "hover:bg-gray-50 hover:text-gray-700",
    badgeColor: "bg-gray-100 text-gray-700 border-gray-200",
    editorClasses: "text-center text-sm text-gray-500",
  },
  TRANSITION: {
    tooltip: "Transition",
    icon: ArrowRight,
    toolbarColor: "hover:bg-red-50 hover:text-red-700",
    badgeColor: "bg-red-100 text-red-700 border-red-200",
    editorClasses: "mt-4 mb-2 text-right uppercase",
  },
  SHOT: {
    tooltip: "Shot",
    icon: Camera,
    toolbarColor: "hover:bg-orange-50 hover:text-orange-700",
    badgeColor: "bg-orange-100 text-orange-700 border-orange-200",
    editorClasses: "my-2 uppercase",
  },
} as const; // 'as const' provides better type safety and autocompletion

// We can create a type that represents the keys of the configurable elements
// This excludes 'SCENE_HEADING' which doesn't appear in the toolbar.
export type ToolbarScriptElementType = keyof Omit<typeof SCRIPT_ELEMENT_CONFIG, 'SCENE_HEADING'>;
