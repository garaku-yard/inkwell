import React from 'react';
import { cn } from '@/lib/utils';
import { type StructureElement } from '@/app/(private)/projects/[id]/outline-editor/page';

interface OutlineNodeProps {
  element: StructureElement;
  level: number;
  activeElementId: string | null;
  onElementSelect: (id: string | null) => void;
}

export function OutlineNode({ element, level, activeElementId, onElementSelect }: OutlineNodeProps) {
  const isActive = activeElementId === element.id;

  const headingStyles: { [key: number]: string } = {
    0: 'text-xl font-bold mb-2',
    1: 'text-lg font-semibold mt-4 mb-1',
    2: 'text-base font-medium mt-3',
  };

  return (
    <div
      style={{ marginLeft: `${level * 2}rem` }}
      className={cn(
        "relative pl-6 my-4 transition-colors duration-200 rounded",
        isActive && "bg-blue-50"
      )}
      onMouseEnter={() => onElementSelect(element.id)}
      onMouseLeave={() => onElementSelect(null)}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded"
        style={{ backgroundColor: element.color }}
      ></div>

      {element.title && (
        <h3
          className={cn("font-semibold", headingStyles[level] || 'text-base')}
          style={{ color: element.color }}
        >
          {element.title}
        </h3>
      )}

      {element.content && (
        <p className="text-gray-700 leading-relaxed mt-1">
          {element.content}
        </p>
      )}

      {element.children && element.children.length > 0 && (
        <div className="mt-2">
          {element.children.map(child => (
            <OutlineNode
              key={child.id}
              element={child}
              level={level + 1}
              activeElementId={activeElementId}
              onElementSelect={onElementSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
