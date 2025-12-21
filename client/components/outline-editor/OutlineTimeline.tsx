import { cn } from '@/lib/utils';
import { type Lane } from '@/services/beat-board';
import { type StructureElement } from '@/app/(private)/projects/[id]/outline-editor/page';

interface OutlineTimelineProps {
  outlines: Lane[];
  structure: StructureElement[];
  activeElementId: string | null;
  onElementSelect: (id: string | null) => void;
}

const flattenStructureForTimeline = (elements: StructureElement[]) => {
  let result: StructureElement[] = [];
  for (const element of elements) {
    if (element.type === 'BEAT') {
      result.push(element);
    }
    if (element.children && element.children.length > 0) {
      result = result.concat(flattenStructureForTimeline(element.children));
    }
  }
  return result;
};

export function OutlineTimeline({ outlines, structure, activeElementId, onElementSelect }: OutlineTimelineProps) {
  const allBeats = flattenStructureForTimeline(structure);
  const totalDuration = allBeats.length || 1;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
      <div className="space-y-1">
        {outlines.map(outline => (
          <div key={outline.id} className="flex items-center h-12">
            <div className="w-40 flex-shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400 pr-4">
              {outline.name}
            </div>
            <div className="relative flex-1 h-full bg-gray-200 dark:bg-gray-800 rounded">
              {allBeats
                .filter(beat => beat.outlineId === outline.id)
                .map((beat, index) => (
                  <div
                    key={beat.id}
                    className={cn(
                      "absolute top-1 bottom-1 rounded-sm flex items-center justify-center text-white text-xs px-2 truncate cursor-pointer",
                      outline.color, // Using the lane color
                      activeElementId === beat.id && "ring-2 ring-offset-1 ring-blue-500"
                    )}
                    style={{
                      left: `${(index / totalDuration) * 100}%`,
                      width: `${(1 / totalDuration) * 100}%`,
                    }}
                    onMouseEnter={() => onElementSelect(beat.id)}
                    onMouseLeave={() => onElementSelect(null)}
                  >
                    {beat.title}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
