"use client"

import React from "react"
import { MapPinned } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { type ToolbarScriptElementType, SCRIPT_ELEMENT_CONFIG } from "@/lib/helpers/screenplay-config"
import { cn } from "@/lib/utils"

const toolbarElementTypes = Object.keys(SCRIPT_ELEMENT_CONFIG).filter(
  (key) => key !== "SCENE_HEADING",
) as ToolbarScriptElementType[]

interface ToolbarProps {
  onInsertElement: (type: ToolbarScriptElementType) => void
  onAddNewScene: () => void
  activeElementType: ToolbarScriptElementType | null
}

export const Toolbar = React.memo(({ onInsertElement, onAddNewScene, activeElementType }: ToolbarProps) => {
  const ActionIcon = SCRIPT_ELEMENT_CONFIG.ACTION.icon

  return (
    <div className="border-b bg-gradient-to-r from-background to-muted/20 shadow-sm">
      <div className="p-3 flex items-center gap-3">
        <TooltipProvider>
          <div className="flex items-center gap-2 bg-primary/5 rounded-lg p-2 border border-primary/10">
            <div className="flex items-center gap-1 text-xs font-medium text-primary/80">
              <MapPinned className="h-3 w-3" />
              Scene
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 bg-primary/10 hover:bg-primary/20 text-primary hover:text-primary font-medium"
                  onClick={onAddNewScene}
                >
                  <MapPinned className="h-4 w-4 mr-1" />
                  New
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add New Scene</TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-8 bg-border/50" />

          <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2 border border-muted">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <ActionIcon className="h-3 w-3" />
              Elements
            </div>
            <div className="flex items-center gap-1">
              {toolbarElementTypes.map((type) => {
                const config = SCRIPT_ELEMENT_CONFIG[type]
                const Icon = config.icon
                const isActive = activeElementType === type

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
                            : "border-transparent hover:border-current/20",
                        )}
                        onClick={() => onInsertElement(type)}
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
})

Toolbar.displayName = "Toolbar"
