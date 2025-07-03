// client/components/editor/Toolbar.tsx
import {
  AlignCenter, AlignLeft, Bold, Italic, Underline, MapPinned,
  Clapperboard, User, MessageSquare, Parentheses, ArrowRight, Camera
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ScriptElement } from "@/services/project"

type ScriptElementType = ScriptElement['elementType'];

interface ToolbarProps {
  onInsertElementTemplate: (type: ScriptElementType) => void;
  onAddNewScene: () => void;
}

const elementButtons: { type: ScriptElementType; tooltip: string; icon: React.ElementType }[] = [
  { type: 'ACTION', tooltip: 'Action', icon: Clapperboard },
  { type: 'CHARACTER', tooltip: 'Character', icon: User },
  { type: 'DIALOG', tooltip: 'Dialogue', icon: MessageSquare },
  { type: 'PARENTHETICAL', tooltip: 'Parenthetical', icon: Parentheses },
  { type: 'TRANSITION', tooltip: 'Transition', icon: ArrowRight },
  { type: 'SHOT', tooltip: 'Shot', icon: Camera },
];

export function Toolbar({ onInsertElementTemplate, onAddNewScene }: ToolbarProps) {
  return (
    <div className="border-b p-2 flex items-center gap-2 bg-background">
      <TooltipProvider>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onAddNewScene}>
                <MapPinned className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scene</TooltipContent>
          </Tooltip>

          {elementButtons.map(({ type, tooltip, icon: Icon }) => (
            <Tooltip key={type}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onInsertElementTemplate(type)}>
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* TODO: Make those functional. */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                <Bold className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bold</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                <Italic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Italic</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                <Underline className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Underline</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                <AlignLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Left</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                <AlignCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Center</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  )
}
