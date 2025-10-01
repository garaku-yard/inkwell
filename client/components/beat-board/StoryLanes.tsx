import React, { useState, useRef, useCallback } from "react"
import { ChevronDown, ChevronUp, GripVertical, Plus, Ruler } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type Beat } from "@/services/beat"
import { type OutlineItem, type Lane } from "@/services/beat-board"

export interface ScriptMarker {
  name: string;
  page: number;
  color: string;
}

interface StoryLanesProps {
  lanes: Lane[];
  draggedLaneId: string | null;
  onUpdateLane: (laneId: string, updates: Partial<Lane>) => void;
  onLaneDragStart: (e: React.DragEvent, laneId: string) => void;
  onLaneDrop: (targetLaneId: string) => void;
  onLaneDragEnd: () => void;
  onAddLane: () => void;
  beats: Beat[];
  outlineItems: OutlineItem[];
  hoveredLane: string | null;
  draggedLaneItem: string | null;
  setHoveredLane: (id: string | null) => void;
  handleDropOnTimeline: (e: React.DragEvent, laneId: string, targetItemId?: string) => void;
  handleLaneDragStart: (e: React.DragEvent, itemId: string) => void;
  setDraggedLaneItem: (id: string | null) => void;
  onUpdateOutlineItem: (itemId: string, updates: Partial<OutlineItem>) => void;
  scriptMarkers: ScriptMarker[];
  totalPages?: number;
  onItemHover?: (beatId: string | null) => void;
}

export function StoryLanes({
  lanes, draggedLaneId, onUpdateLane, onLaneDragStart, onLaneDrop, onLaneDragEnd,
  beats, outlineItems, hoveredLane, draggedLaneItem, setHoveredLane,
  handleDropOnTimeline, handleLaneDragStart, setDraggedLaneItem,
  onUpdateOutlineItem, totalPages = 120, scriptMarkers,
  onAddLane, onItemHover
}: StoryLanesProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const [resizingItem, setResizingItem] = useState<{ itemId: string; edge: "left" | "right" } | null>(null);
  const [slidingItem, setSlidingItem] = useState<{ itemId: string; startX: number; originalPosition: number; } | null>(null);
  const [editingLaneId, setEditingLaneId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<string | null>(null);

  const getPagePosition = (page: number) => (page / totalPages) * 100;
  const getPageFromPosition = (position: number) => { const page = (position / 100) * totalPages; return Math.max(1, page); }
  const snapToEighthOfPage = (positionPercent: number) => { const totalEighths = totalPages * 8; const currentEighth = (positionPercent / 100) * totalEighths; const snappedEighth = Math.round(currentEighth); return (snappedEighth / totalEighths) * 100; };

  const handleItemMouseDown = (e: React.MouseEvent, itemId: string, edge?: "left" | "right") => {
    e.preventDefault();
    e.stopPropagation();
    const item = outlineItems.find(i => i.id === itemId);
    if (!item) return;
    if (edge) {
      setResizingItem({ itemId, edge });
    } else {
      setSlidingItem({
        itemId,
        startX: e.clientX,
        originalPosition: item.timelinePosition || 0,
      });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!timelineContainerRef.current) return;
    const timelineArea = timelineContainerRef.current.querySelector('.timeline-area-content');
    if (!timelineArea) return;
    const rect = timelineArea.getBoundingClientRect();
    const getBoundaries = (item: OutlineItem) => {
      const laneItems = outlineItems.filter(i => i.laneId === item.laneId).sort((a, b) => (a.timelinePosition || 0) - (b.timelinePosition || 0));
      const currentIndex = laneItems.findIndex(i => i.id === item.id);
      const prevItem = laneItems[currentIndex - 1];
      const nextItem = laneItems[currentIndex + 1];
      const gapPercentage = 0.5;
      const leftBoundary = prevItem ? (prevItem.timelinePosition || 0) + (prevItem.width || 0) + gapPercentage : 0;
      const rightBoundary = nextItem ? (nextItem.timelinePosition || 0) - gapPercentage : 100;
      return { leftBoundary, rightBoundary };
    };
    if (resizingItem) {
      const item = outlineItems.find((i) => i.id === resizingItem.itemId);
      if (!item) return;
      const { leftBoundary, rightBoundary } = getBoundaries(item);
      const rawPosition = ((e.clientX - rect.left) / rect.width) * 100;
      const snappedPosition = snapToEighthOfPage(rawPosition);
      if (resizingItem.edge === "left") {
        const originalEndPosition = (item.timelinePosition || 0) + (item.width || 0);
        const newStartPosition = Math.max(leftBoundary, Math.min(snappedPosition, originalEndPosition));
        const newWidth = originalEndPosition - newStartPosition;
        if (newWidth > 0) onUpdateOutlineItem(resizingItem.itemId, { timelinePosition: newStartPosition, width: newWidth });
      } else {
        const startPosition = item.timelinePosition || 0;
        const newEndPosition = Math.min(rightBoundary, Math.max(snappedPosition, startPosition));
        const newWidth = newEndPosition - startPosition;
        if (newWidth > 0) onUpdateOutlineItem(resizingItem.itemId, { width: newWidth });
      }
    } else if (slidingItem) {
      const item = outlineItems.find(i => i.id === slidingItem.itemId);
      if (!item) return;
      const { leftBoundary, rightBoundary } = getBoundaries(item);
      const deltaX = e.clientX - slidingItem.startX;
      const deltaPercent = (deltaX / rect.width) * 100;
      const newPosition = slidingItem.originalPosition + deltaPercent;
      const itemWidth = item.width || 0;
      const clampedPosition = Math.max(leftBoundary, Math.min(newPosition, rightBoundary - itemWidth));
      onUpdateOutlineItem(slidingItem.itemId, { timelinePosition: snapToEighthOfPage(clampedPosition) });
    }
  }, [resizingItem, slidingItem, outlineItems, onUpdateOutlineItem, totalPages]);

  const handleMouseUp = useCallback(() => {
    setResizingItem(null);
    setSlidingItem(null);
  }, []);

  React.useEffect(() => {
    if (resizingItem || slidingItem) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [resizingItem, slidingItem, handleMouseMove, handleMouseUp]);

  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <div className="px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ruler className="h-4 w-4 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-600">Story Structure</h3>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">{outlineItems.length} items</span>
          <Button variant="ghost" size="sm" className="h-6 p-1" onClick={onAddLane}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)} className="h-6 w-6 p-0">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {isExpanded && (
        <div className="px-6 pb-3" ref={timelineContainerRef}>
          <div className="relative">
            <div className="flex h-6 mb-1">
              <div className="w-28 flex-shrink-0" />
              <div className="relative flex-1 bg-white border border-gray-300 rounded-t timeline-area-content">
                {Array.from({ length: Math.ceil(totalPages / 10) }, (_, i) => { const page = (i + 1) * 10; if (page > totalPages) return null; return (<div key={page} className="absolute top-0 bottom-0 flex items-center" style={{ left: `${getPagePosition(page)}%` }}> <div className="w-px bg-gray-400 h-full" /> <span className="text-xs text-gray-600 ml-1 font-mono">{page}</span> </div>); })}
                <div className="absolute left-0 top-0 bottom-0 flex items-center"><div className="w-px bg-gray-600 h-full" /><span className="text-xs text-gray-800 ml-1 font-mono font-semibold">1</span></div>
              </div>
            </div>
            <div className="space-y-1 mb-3">
              {lanes.map((lane) => (
                <div
                  key={lane.id}
                  className={`flex items-center transition-colors rounded border-2 ${hoveredLane === lane.id ? "border-blue-400" : "border-transparent"} ${draggedLaneId === lane.id ? "opacity-30" : ""} ${dropIndicator === lane.id ? "!border-blue-500 border-dashed" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedLaneId !== null && draggedLaneId !== lane.id) {
                      setDropIndicator(lane.id);
                    }
                  }}
                  onDragLeave={() => setDropIndicator(null)}
                  onDrop={() => {
                    onLaneDrop(lane.id);
                    setDropIndicator(null);
                  }}
                  onMouseEnter={() => setHoveredLane(lane.id)}
                  onMouseLeave={() => setHoveredLane(null)}
                >
                  <div
                    className="w-28 flex-shrink-0 h-16 flex items-center justify-start pl-2 bg-white rounded-l cursor-grab"
                    draggable
                    onDragStart={(e) => onLaneDragStart(e, lane.id)}
                    onDragEnd={onLaneDragEnd}
                  >
                    {editingLaneId === lane.id ? (
                      <Input
                        value={lane.name}
                        onChange={(e) => onUpdateLane(lane.id, { name: e.target.value })}
                        onBlur={() => setEditingLaneId(null)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setEditingLaneId(null); }}
                        autoFocus
                        className="h-8 text-xs"
                      />
                    ) : (
                      <span
                        className="font-medium text-gray-700 text-xs p-2 w-full"
                        onDoubleClick={() => setEditingLaneId(lane.id)}
                      >
                        {lane.name}
                      </span>
                    )}
                  </div>
                  <div className={`relative flex-1 h-16 timeline-area-content ${hoveredLane === lane.id ? "bg-blue-50" : "bg-white"}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); handleDropOnTimeline(e, lane.id); }}>
                    {outlineItems.filter((item) => item.laneId === lane.id).map((item) => {
                      const beat = beats.find(b => b.id === item.beatId); if (!beat) return null;
                      const position = item.timelinePosition || 0; const width = item.width || getPagePosition(5); const startPage = Math.max(1, Math.round(getPageFromPosition(position))); const endPage = Math.round(getPageFromPosition(position + width));
                      const isInteracting = resizingItem?.itemId === item.id || slidingItem?.itemId === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`absolute top-2 bottom-2 rounded border shadow-sm flex items-center text-xs font-medium transition-all group ${draggedLaneItem === item.id ? "opacity-30" : ""} ${isInteracting ? "ring-2 ring-blue-400 z-10" : ""}`} style={{ left: `${position}%`, width: `${width}%`, backgroundColor: beat.color, minWidth: "20px", cursor: isInteracting ? 'grabbing' : 'grab' }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.stopPropagation(); handleDropOnTimeline(e, item.laneId, item.id); }}
                          onMouseDown={(e) => handleItemMouseDown(e, item.id)}
                          onMouseEnter={() => onItemHover?.(beat.id)} // FIX: Call new prop with BEAT id
                          onMouseLeave={() => onItemHover?.(null)}    // FIX: Call new prop
                        >
                          <div draggable={true} onDragStart={(e) => { e.dataTransfer.setData("application/x-outline-item-id", item.id); e.dataTransfer.effectAllowed = "move"; handleLaneDragStart(e, item.id) }} onDragEnd={() => setDraggedLaneItem(null)} className="absolute left-1 top-1/2 -translate-y-1/2 p-0.5 cursor-move opacity-0 group-hover:opacity-60 hover:opacity-100 z-20" onMouseDown={(e) => e.stopPropagation()}> <GripVertical className="h-3 w-3" /> </div>
                          <div className="absolute left-0 top-0 bottom-0 w-2 opacity-0 group-hover:opacity-100 cursor-ew-resize z-20 hover:bg-black/10" onMouseDown={(e) => { e.stopPropagation(); handleItemMouseDown(e, item.id, "left"); }} />
                          <div className="px-2 text-center truncate ml-3"><div className="font-semibold">{beat.title}</div><div className="text-xs opacity-75">Pg. {startPage}-{endPage}</div></div>
                          <div className="absolute right-0 top-0 bottom-0 w-2 opacity-0 group-hover:opacity-100 cursor-ew-resize z-20 hover:bg-black/10" onMouseDown={(e) => { e.stopPropagation(); handleItemMouseDown(e, item.id, "right"); }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex">
              <div className="w-28 flex-shrink-0" />
              <div className="relative flex-1 h-4 bg-gradient-to-r from-green-100 via-yellow-100 to-green-100 border border-gray-300 rounded">
                {scriptMarkers.map((marker) => (
                  <div key={marker.name} className="absolute top-0 bottom-0 group cursor-help" style={{ left: `${getPagePosition(marker.page)}%` }}>
                    <div className="w-1 h-full opacity-80" style={{ backgroundColor: marker.color }} />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                      {marker.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
