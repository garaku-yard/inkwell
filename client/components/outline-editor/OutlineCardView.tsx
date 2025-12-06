import React from 'react';
import { cn } from '@/lib/utils';
import { type Beat } from '@/services/beat';
import { type Lane, type OutlineItem } from '@/services/beat-board';

interface OutlineCardViewProps {
  lanes: Lane[];
  beats: Beat[];
  outlineItems: OutlineItem[];
  activeElementId: string | null;
  onElementSelect: (id: string | null) => void;
}

// Parse page range from sceneNumbers string
const parsePageRange = (sceneNumbers: string): { start: number; end: number } | null => {
  if (!sceneNumbers) return null;
  const cleaned = sceneNumbers.replace(/Pg\.\s*/i, '');
  const parts = cleaned.split('-').map(p => parseInt(p.trim(), 10));
  if (parts.length === 1 && !isNaN(parts[0])) return { start: parts[0], end: parts[0] };
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return { start: parts[0], end: parts[1] };
  return null;
};

export function OutlineCardView({ 
  lanes, 
  beats, 
  outlineItems, 
  activeElementId, 
  onElementSelect 
}: OutlineCardViewProps) {
  // Sort lanes by order
  const sortedLanes = [...lanes].sort((a, b) => a.order - b.order);

  // Group outline items by lane and parse page ranges
  const itemsByLane = sortedLanes.map(lane => {
    const laneItems = outlineItems
      .filter(item => item.laneId === lane.id)
      .map(item => {
        const beat = beats.find(b => b.id === item.beatId);
        const pageRange = beat?.sceneNumbers ? parsePageRange(beat.sceneNumbers) : null;
        return { ...item, beat, pageRange };
      })
      .filter(item => item.beat && item.pageRange) // Only include items with valid beats and page ranges
      .sort((a, b) => {
        // Sort by start page chronologically
        const pageA = a.pageRange?.start ?? Infinity;
        const pageB = b.pageRange?.start ?? Infinity;
        return pageA - pageB;
      });

    return { lane, items: laneItems };
  }).filter(group => group.items.length > 0); // Only show lanes with items

  // Flatten all items and sort by page number chronologically
  const allItems = itemsByLane.flatMap(({ lane, items }) => 
    items.map(item => ({ ...item, lane }))
  ).sort((a, b) => {
    const pageA = a.pageRange?.start ?? Infinity;
    const pageB = b.pageRange?.start ?? Infinity;
    return pageA - pageB;
  });

  if (allItems.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-8 bg-gray-100">
        <div className="text-center text-gray-500 mt-12">
          <p className="text-lg">No beats to display in outline view.</p>
          <p className="text-sm mt-2">Add beats to your lanes in the Story Structure timeline above, or go back to the Beat Board.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-gray-100">
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Story Outline</h2>
          <p className="text-sm text-gray-500">Beats displayed in chronological order by page number</p>
        </div>
        
        {/* Beat Cards in Sequential Order */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allItems.map(({ beat, id: itemId, lane, pageRange }) => {
            if (!beat) return null;
            
            const isActive = activeElementId === beat.id;
                
            return (
              <div
                key={itemId}
                className={cn(
                  "bg-white border-2 rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-pointer relative",
                  isActive ? "border-blue-500 shadow-lg" : "border-gray-200"
                )}
                onMouseEnter={() => onElementSelect(beat.id)}
                onMouseLeave={() => onElementSelect(null)}
                onClick={() => onElementSelect(beat.id)}
              >
                {/* Color Indicator at Top */}
                <div
                  className="absolute top-0 left-0 w-full h-1 rounded-t-lg"
                  style={{ backgroundColor: lane.color }}
                />

                {/* Lane Badge */}
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: lane.color }}
                  />
                  <span className="text-xs font-medium text-gray-500">{lane.name}</span>
                </div>

                {/* Beat Title */}
                {beat.title && (
                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                    {beat.title}
                  </h3>
                )}

                {/* Beat Description */}
                {beat.description && (
                  <p className="text-sm text-gray-600 line-clamp-4 mb-3">
                    {beat.description}
                  </p>
                )}

                {/* Scene Number / Page Range */}
                {beat.sceneNumbers && (
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <span className="text-xs font-medium text-gray-500">
                      {beat.sceneNumbers}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
