import type React from "react"
import {
  AlignCenter,
  AlignLeft,
  Bold,
  Italic,
  Underline,
  MapPinned,
  Clapperboard,
  User,
  MessageSquare,
  Parentheses,
  ArrowRight,
  Camera,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import type { ScriptElement } from "@/services/project"

type ScriptElementType = ScriptElement["elementType"]

interface ToolbarProps {
  onInsertElement: (type: ScriptElementType) => void
  onAddNewScene: () => void
}

const elementButtons: { type: ScriptElementType; tooltip: string; icon: React.ElementType; color: string }[] = [
  { type: "ACTION", tooltip: "Action", icon: Clapperboard, color: "hover:bg-purple-50 hover:text-purple-700" },
  { type: "CHARACTER", tooltip: "Character", icon: User, color: "hover:bg-blue-50 hover:text-blue-700" },
  { type: "DIALOG", tooltip: "Dialogue", icon: MessageSquare, color: "hover:bg-green-50 hover:text-green-700" },
  { type: "PARENTHETICAL", tooltip: "Parenthetical", icon: Parentheses, color: "hover:bg-gray-50 hover:text-gray-700" },
  { type: "TRANSITION", tooltip: "Transition", icon: ArrowRight, color: "hover:bg-red-50 hover:text-red-700" },
  { type: "SHOT", tooltip: "Shot", icon: Camera, color: "hover:bg-orange-50 hover:text-orange-700" },
]

export function Toolbar({ onInsertElement, onAddNewScene }: ToolbarProps) {
  return (
    <div className="border-b bg-gradient-to-r from-background to-muted/20 shadow-sm">
      <div className="p-3 flex items-center gap-3">
        <TooltipProvider>
          {/* Scene Section */}
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

          {/* Script Elements Section */}
          <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2 border border-muted">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Clapperboard className="h-3 w-3" />
              Elements
            </div>
            <div className="flex items-center gap-1">
              {elementButtons.map(({ type, tooltip, icon: Icon, color }) => (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 w-8 transition-all duration-200 ${color} border border-transparent hover:border-current/20`}
                      onClick={() => onInsertElement(type)}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="flex items-center gap-2">
                      <Icon className="h-3 w-3" />
                      {tooltip}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          <Separator orientation="vertical" className="h-8 bg-border/50" />

          {/* Text Formatting Section */}
          <div className="flex items-center gap-2 bg-amber-50/50 rounded-lg p-2 border border-amber-200/50">
            <div className="flex items-center gap-1 text-xs font-medium text-amber-700/80">
              <Bold className="h-3 w-3" />
              Format
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 hover:bg-amber-100 hover:text-amber-700 transition-colors"
                    disabled
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-2">
                    <Bold className="h-3 w-3" />
                    Bold
                    <Badge variant="secondary" className="text-xs">
                      Soon
                    </Badge>
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 hover:bg-amber-100 hover:text-amber-700 transition-colors"
                    disabled
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-2">
                    <Italic className="h-3 w-3" />
                    Italic
                    <Badge variant="secondary" className="text-xs">
                      Soon
                    </Badge>
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 hover:bg-amber-100 hover:text-amber-700 transition-colors"
                    disabled
                  >
                    <Underline className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-2">
                    <Underline className="h-3 w-3" />
                    Underline
                    <Badge variant="secondary" className="text-xs">
                      Soon
                    </Badge>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      </div>
    </div>
  )
}
