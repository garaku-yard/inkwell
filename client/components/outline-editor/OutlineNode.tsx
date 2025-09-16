import React from 'react';
import { cn } from '@/lib/utils';
import { type Beat } from '@/services/beat';

interface OutlineNodeProps {
  beat: Beat;
  isActive: boolean;
  onElementSelect: (id: string | null) => void;
}

export function OutlineNode({ beat, isActive, onElementSelect }: OutlineNodeProps) {
  return (
    <div
      className={cn(
        "relative pl-6 my-6 transition-colors duration-200 rounded",
        isActive && "bg-blue-50"
      )}
      onMouseEnter={() => onElementSelect(beat.id)}
      onMouseLeave={() => onElementSelect(null)}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded"
        style={{ backgroundColor: beat.color }}
      ></div>

      {beat.title && (
        <h3
          className="text-lg font-semibold"
          style={{ color: beat.color }}
        >
          {beat.title}
        </h3>
      )}

      {beat.description && (
        <p className="text-gray-700 leading-relaxed mt-2">
          {beat.description}
        </p>
      )}
    </div>
  );
}
