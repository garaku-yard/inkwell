"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { type ToolbarScriptElementType, SCRIPT_ELEMENT_CONFIG } from "@/lib/helpers/screenplay-config"
import { cn } from "@/lib/utils"

type ScriptConfigKey = keyof typeof SCRIPT_ELEMENT_CONFIG;

const allElementTypes = Object.keys(SCRIPT_ELEMENT_CONFIG) as ScriptConfigKey[]

interface ToolbarProps {
  onInsertElement: (type: ToolbarScriptElementType) => void
  onTransformElement: (type: ToolbarScriptElementType | "SCENE_HEADING") => void
  onAddNewScene: () => void
  activeElementType: ToolbarScriptElementType | "SCENE_HEADING" | null
  hasActiveElement: boolean
}

export const Toolbar = React.memo(
  React.forwardRef<HTMLDivElement, ToolbarProps>(({ onInsertElement, onTransformElement, onAddNewScene, activeElementType, hasActiveElement }, ref) => {
  const ActionIcon = SCRIPT_ELEMENT_CONFIG.ACTION.icon

  return (
    <div ref={ref} className="border-b bg-gradient-to-r from-background to-muted/20 shadow-sm">
      <div className="p-3 flex items-center gap-3">
        <TooltipProvider>
          <Separator orientation="vertical" className="h-8 bg-border/50" />

          <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2 border border-muted">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <ActionIcon className="h-3 w-3" />
              Elements
            </div>
            <div className="flex items-center gap-1">
              {/* Change the map variable to ScriptConfigKey */}
              {allElementTypes.map((type: ScriptConfigKey) => {
                const config = SCRIPT_ELEMENT_CONFIG[type]
                const Icon = config.icon

                const isSceneHeading = type === 'SCENE_HEADING';
                const isActive = activeElementType === type;

                const handleClick = () => {
                  if (hasActiveElement) {
                    // Transform current element to the clicked type (including scene ↔ element)
                    if (activeElementType !== type) {
                      onTransformElement(type as ToolbarScriptElementType | "SCENE_HEADING")
                    }
                  } else if (isSceneHeading) {
                    // No active element, create new scene
                    onAddNewScene()
                  } else {
                    // No active element, insert new element
                    onInsertElement(type as ToolbarScriptElementType)
                  }
                }

                return (
                  <Tooltip key={type}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 w-8 transition-all duration-200 border",
                          config.toolbarColor,
                          isActive
                            ? "bg-primary/10 text-primary border-primary/20"
                            : isSceneHeading
                              ? "border-transparent text-primary hover:bg-primary/10 hover:border-primary/20"
                              : "border-transparent hover:border-current/20",
                          isSceneHeading && "font-semibold"
                        )}
                        onClick={handleClick}
                      >
                        <Icon className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <Icon className="h-3 w-3" />
                        {config.tooltip}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        </TooltipProvider>
      </div>
    </div>
  )
}))

Toolbar.displayName = "Toolbar"
