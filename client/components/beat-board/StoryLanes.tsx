import { GripVertical } from "lucide-react";
import type { Beat } from "@/services/beat";
import type { OutlineItem } from "@/app/(private)/projects/[id]/beat-board/page";

const LANES = [
  { id: 1, name: "Main Plot", color: "#dbeafe" },
  { id: 2, name: "Subplot A", color: "#dcfce7" },
  { id: 3, name: "Subplot B", color: "#fef3c7" },
];

interface StoryLanesProps {
  beats: Beat[];
  outlineItems: OutlineItem[];
  hoveredLane: number | null;
  draggedLaneItem: string | null;
  setHoveredLane: (id: number | null) => void;
  handleDropOnLane: (e: React.DragEvent, laneId: number) => void;
  handleLaneDragStart: (e: React.DragEvent, itemId: string) => void;
  handleLaneDrop: (e: React.DragEvent, targetItemId: string) => void;
  setDraggedLaneItem: (id: string | null) => void;
}

export function StoryLanes({
  beats, outlineItems, hoveredLane, draggedLaneItem, setHoveredLane,
  handleDropOnLane, handleLaneDragStart, handleLaneDrop, setDraggedLaneItem
}: StoryLanesProps) {
  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <div className="px-6 py-2">
        <h3 className="text-sm font-medium text-gray-600 mb-3">Story Structure Lanes</h3>
        <div className="space-y-2">
          {LANES.map((lane) => (
            <div
              key={lane.id}
              className={`relative h-16 rounded-lg border-2 border-dashed transition-colors ${hoveredLane === lane.id ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-white"}`}
              onMouseEnter={() => setHoveredLane(lane.id)} onMouseLeave={() => setHoveredLane(null)}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDropOnLane(e, lane.id)}>
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-gray-700 text-sm">{lane.name}</span>
              </div>
              <div className="ml-32 h-full relative flex items-center gap-2 px-2 overflow-x-auto">
                {outlineItems
                  .filter((item) => item.laneId === lane.id).sort((a, b) => a.order - b.order)
                  .map((item) => {
                    const beat = beats.find((b) => b.id === item.beatId);
                    if (!beat) return null;
                    return (
                      <div
                        key={item.id} draggable={true}
                        onDragStart={(e) => handleLaneDragStart(e, item.id)}
                        onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleLaneDrop(e, item.id)}
                        onDragEnd={() => setDraggedLaneItem(null)}
                        className={`h-10 px-3 rounded border shadow-sm flex-shrink-0 flex items-center cursor-grab text-xs font-medium transition-opacity ${draggedLaneItem === item.id ? "opacity-50" : "opacity-100"}`}
                        style={{ backgroundColor: beat.color }} >
                        {beat.title}
                      </div>
                    );
                  })}
                {outlineItems.filter((item) => item.laneId === lane.id).length === 0 && (
                  <span className="text-xs text-gray-400 italic pointer-events-none">Drop beats here to create outline items</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
