import type React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MoreHorizontal, Trash2, GripHorizontal } from "lucide-react"
import type { Beat } from "@/services/beat" // Assuming Beat type is exported

const PRESET_COLORS = [
  "#fef3c7", "#fed7aa", "#dbeafe", "#dcfce7", "#f3e8ff", "#fce7f3",
  "#f3f4f6", "#fee2e2", "#ecfdf5", "#fef7cd", "#e0f2fe", "#f1f5f9",
];

interface BeatCardProps {
  beat: Beat;
  editingField: { beatId: string; field: keyof Beat } | null;
  colorPickerOpen: string | null;
  draggedBeat: string | null;
  movingBeatId: string | null;
  isResizing: string | null;
  onMouseDownOnBeat: (e: React.MouseEvent, beatId: string) => void;
  onDragStartOnBeat: (beatId: string) => void;
  onDragEndOnBeat: () => void;
  onResizeMouseDown: (e: React.MouseEvent, beatId: string) => void;
  handleFieldChange: (beatId: string, field: keyof Beat, value: any) => void;
  handleDoubleClick: (beatId: string, field: keyof Beat) => void;
  handleFieldBlur: () => void;
  setColorPickerOpen: (id: string | null) => void;
  handleChangeColor: (beatId: string, color: string) => void;
  handleDeleteBeat: (beatId: string) => void;
  children: React.ReactNode; // For connection handles
}

export function BeatCard({
  beat, editingField, colorPickerOpen, draggedBeat, movingBeatId, isResizing,
  onMouseDownOnBeat, onDragStartOnBeat, onDragEndOnBeat, onResizeMouseDown,
  handleFieldChange, handleDoubleClick, handleFieldBlur, setColorPickerOpen,
  handleChangeColor, handleDeleteBeat, children
}: BeatCardProps) {

  return (
    <div
      key={beat.id}
      className={`absolute border rounded-lg p-4 shadow-md transition-all duration-100 hover:shadow-xl group flex flex-col ${draggedBeat === beat.id || movingBeatId === beat.id ? "shadow-2xl scale-105 cursor-grabbing" : "cursor-grab"
        }`}
      style={{
        left: beat.position.x, top: beat.position.y, width: beat.width, height: beat.height,
        backgroundColor: beat.color, borderColor: draggedBeat === beat.id || movingBeatId === beat.id ? "#3b82f6" : "#d1d5db",
        zIndex: draggedBeat === beat.id || movingBeatId === beat.id || isResizing === beat.id ? 10 : 2,
      }}
      onMouseDown={(e) => onMouseDownOnBeat(e, beat.id)}
    >
      {children} {/* Renders Connection Handles */}
      <div
        className="resize-handle absolute -bottom-1 -right-1 w-3 h-3 bg-gray-600 border border-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-nwse-resize hover:bg-gray-800"
        onMouseDown={(e) => onResizeMouseDown(e, beat.id)}
      />

      {/* Header with Title, Menus, and new Drag Handle */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0" onDoubleClick={() => handleDoubleClick(beat.id, "title")}>
          {editingField?.beatId === beat.id && editingField?.field === "title" ? (
            <Input autoFocus onBlur={handleFieldBlur} value={beat.title} onChange={(e) => handleFieldChange(beat.id, "title", e.target.value)} className="h-auto p-0 text-sm font-semibold border-none bg-transparent focus-visible:ring-0" />
          ) : (
            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">{beat.title}</h3>
          )}
          <div onDoubleClick={() => handleDoubleClick(beat.id, "sceneNumbers")}>
            {editingField?.beatId === beat.id && editingField?.field === "sceneNumbers" ? (
              <Input autoFocus onBlur={handleFieldBlur} value={beat.sceneNumbers} onChange={(e) => handleFieldChange(beat.id, "sceneNumbers", e.target.value)} className="h-auto p-0 text-xs border-none bg-transparent focus-visible:ring-0 text-gray-500" />
            ) : (
              <p className="text-xs text-gray-500 font-medium truncate">{beat.sceneNumbers}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* NEW: Dedicated Drag Handle for cloning to lanes */}
          <div
            draggable={true}
            onDragStart={() => onDragStartOnBeat(beat.id)}
            onDragEnd={onDragEndOnBeat}
            className="p-1 cursor-grab opacity-0 group-hover:opacity-100"
            onMouseDown={(e) => e.stopPropagation()} // Prevent card move when grabbing handle
          >
            <GripHorizontal className="h-5 w-5 text-gray-500" />
          </div>

          <Popover open={colorPickerOpen === beat.id} onOpenChange={(open) => setColorPickerOpen(open ? beat.id : null)}>
            <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}><div className="w-4 h-4 rounded-full border" style={{ backgroundColor: beat.color }} /></Button></PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end"><div className="grid grid-cols-6 gap-2 mt-2">{PRESET_COLORS.map((color) => (<button key={color} className="w-8 h-8 rounded border-2 hover:border-gray-400" style={{ backgroundColor: color, borderColor: beat.color === color ? "#3b82f6" : "#e5e7eb" }} onClick={() => handleChangeColor(beat.id, color)} />))}</div></PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handleDeleteBeat(beat.id)} className="text-red-600 focus:text-red-600 focus:bg-red-50"><Trash2 className="h-4 w-4 mr-2" />Delete Beat</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Description */}
      <div className="flex-1 overflow-auto" onDoubleClick={() => handleDoubleClick(beat.id, "description")}>
        {editingField?.beatId === beat.id && editingField?.field === "description" ? (
          <Textarea autoFocus onBlur={handleFieldBlur} value={beat.description} onChange={(e) => handleFieldChange(beat.id, "description", e.target.value)} className="text-sm w-full h-full bg-transparent border-none outline-none resize-none p-0 focus-visible:ring-0" />
        ) : (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{beat.description}</p>
        )}
      </div>
    </div>
  );
}
