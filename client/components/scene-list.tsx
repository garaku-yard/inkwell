"use client"

import { ChevronDown, ChevronRight, GripVertical } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type Scene = {
  id: string
  title: string
  expanded?: boolean
  active?: boolean
  children?: Scene[]
}

const scenes: Scene[] = [
  {
    id: "1",
    title: "EXT. CITY STREET - DAY",
    active: true,
  },
  {
    id: "2",
    title: "INT. OFFICE BUILDING - DAY",
  },
  {
    id: "3",
    title: "INT. JANE'S APARTMENT - NIGHT",
    expanded: true,
    children: [
      {
        id: "3.1",
        title: "LIVING ROOM",
      },
      {
        id: "3.2",
        title: "KITCHEN",
      },
    ],
  },
  {
    id: "4",
    title: "EXT. PARK - SUNSET",
  },
]

export function SceneList() {
  return (
    <div className="space-y-1">
      {scenes.map((scene) => (
        <SceneItem key={scene.id} scene={scene} />
      ))}
    </div>
  )
}

function SceneItem({ scene }: { scene: Scene }) {
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50",
          scene.active && "bg-accent",
        )}
      >
        <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-muted-foreground">
          <GripVertical className="h-3.5 w-3.5" />
        </Button>
        {scene.children ? (
          <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
            {scene.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        ) : (
          <div className="w-5" />
        )}
        <span className="flex-1 truncate">{scene.title}</span>
      </div>
      {scene.expanded && scene.children && (
        <div className="ml-6 mt-1 space-y-1">
          {scene.children.map((child) => (
            <SceneItem key={child.id} scene={child} />
          ))}
        </div>
      )}
    </div>
  )
}
