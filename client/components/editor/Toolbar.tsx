"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { type ToolbarScriptElementType, SCRIPT_ELEMENT_CONFIG, ELEMENT_ORDER } from "@/lib/helpers/screenplay-config"
import { cn } from "@/lib/utils"

type ScriptConfigKey = keyof typeof SCRIPT_ELEMENT_CONFIG

interface ToolbarProps {
  onInsertElement: (type: ToolbarScriptElementType) => void
  onTransformElement: (type: ToolbarScriptElementType | "SCENE_HEADING") => void
  onAddNewScene: () => void
  activeElementType: ToolbarScriptElementType | "SCENE_HEADING" | null
  hasActiveElement: boolean
}

interface ElementButtonProps {
  type: ScriptConfigKey
  activeElementType: ToolbarScriptElementType | "SCENE_HEADING" | null
  hasActiveElement: boolean
  onInsertElement: (type: ToolbarScriptElementType) => void
  onTransformElement: (type: ToolbarScriptElementType | "SCENE_HEADING") => void
  onAddNewScene: () => void
}

const ElementButton: React.FC<ElementButtonProps> = ({
  type,
  activeElementType,
  hasActiveElement,
  onInsertElement,
  onTransformElement,
  onAddNewScene,
}) => {
  const config = SCRIPT_ELEMENT_CONFIG[type]
  const Icon = config.icon
  const isSceneHeading = type === "SCENE_HEADING"
  const isActive = activeElementType === type
  const isComingSoon = "comingSoon" in config && config.comingSoon

  const handleClick = () => {
    if (isComingSoon) return

    if (hasActiveElement) {
      if (activeElementType !== type) {
        onTransformElement(type as ToolbarScriptElementType | "SCENE_HEADING")
      }
    } else if (isSceneHeading) {
      onAddNewScene()
    } else {
      onInsertElement(type as ToolbarScriptElementType)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-9 w-9 transition-all duration-200 border",
            isComingSoon
              ? "opacity-40 cursor-not-allowed"
              : config.toolbarColor,
            isActive && !isComingSoon
              ? "bg-primary/10 text-primary border-primary/30 shadow-sm"
              : "border-transparent hover:border-current/20",
            isSceneHeading && "font-semibold"
          )}
          onClick={handleClick}
          disabled={isComingSoon}
        >
          <Icon className="h-4.5 w-4.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <Icon className="h-3 w-3" />
        <span>{config.tooltip}</span>
        {isComingSoon && (
          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
            Coming Soon
          </span>
        )}
        {isActive && !isComingSoon && (
          <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded">
            active
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export const Toolbar = React.memo(
  React.forwardRef<HTMLDivElement, ToolbarProps>(
    ({ onInsertElement, onTransformElement, onAddNewScene, activeElementType, hasActiveElement }, ref) => {
      return (
        <div ref={ref} className="border-b bg-gradient-to-r from-background to-muted/20 shadow-sm">
          <div className="px-2 py-2 flex items-center justify-center">
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1 bg-muted/30 rounded-lg px-2 py-1.5 border border-muted">
                {ELEMENT_ORDER.map((type) => (
                  <ElementButton
                    key={type}
                    type={type}
                    activeElementType={activeElementType}
                    hasActiveElement={hasActiveElement}
                    onInsertElement={onInsertElement}
                    onTransformElement={onTransformElement}
                    onAddNewScene={onAddNewScene}
                  />
                ))}
              </div>
            </TooltipProvider>
          </div>
        </div>
      )
    }
  )
)

Toolbar.displayName = "Toolbar"
