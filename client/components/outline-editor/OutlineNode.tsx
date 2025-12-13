import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { type StructureElement } from '@/app/(private)/projects/[id]/outline-editor/page';

interface OutlineNodeProps {
  element: StructureElement;
  level: number;
  activeElementId: string | null;
  onElementSelect: (id: string | null) => void;
  onDragStart?: (e: React.DragEvent, elementId: string) => void;
  onDragOver?: (e: React.DragEvent, elementId: string) => void;
  onDrop?: (e: React.DragEvent, elementId: string) => void;
  showScriptContent?: boolean;
}

export function OutlineNode({ 
  element, 
  level, 
  activeElementId, 
  onElementSelect,
  onDragStart,
  onDragOver,
  onDrop,
  showScriptContent = false
}: OutlineNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isActive = activeElementId === element.id;
  const hasChildren = element.children && element.children.length > 0;

  const handleDragStart = (e: React.DragEvent) => {
    if (onDragStart) {
      onDragStart(e, element.id);
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (onDragOver) {
      onDragOver(e, element.id);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDrop) {
      onDrop(e, element.id);
    }
  };

  // Act level (level 0) - Full width colored section
  if (level === 0) {
    return (
      <div className="relative">
        {/* Act Header */}
        <div
          className={cn(
            "sticky top-24 z-10 border-b bg-gradient-to-r from-transparent via-white to-transparent dark:via-gray-900 py-4 pl-6",
            isActive && "ring-2 ring-blue-500"
          )}
          style={{ 
            backgroundColor: `${element.color}15`,
            borderLeft: `6px solid ${element.color}`
          }}
          onMouseEnter={() => onElementSelect(element.id)}
          onMouseLeave={() => onElementSelect(null)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {hasChildren && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="hover:bg-gray-100 dark:hover:bg-gray-800 rounded p-1"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-gray-600" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-600" />
                  )}
                </button>
              )}
              <h2 className="text-2xl font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                {element.title}
              </h2>
            </div>
          </div>
          {element.content && (
            <p className="mt-2 text-base text-gray-700 dark:text-gray-300 italic">
              {element.content}
            </p>
          )}
        </div>

        {/* Act Content */}
        {isExpanded && hasChildren && (
          <div className="px-12 py-6 mt-15">
            {element.children.map(child => (
              <OutlineNode
                key={child.id}
                element={child}
                level={level + 1}
                activeElementId={activeElementId}
                onElementSelect={onElementSelect}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                showScriptContent={showScriptContent}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Sequence/Beat level (level 1+) - Colored bars with screenplay formatting
  return (
    <div className="mb-8">
      {/* Beat/Sequence Header */}
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "relative pl-6 py-3 mb-4 rounded-r-lg cursor-pointer transition-all",
          isActive && "bg-blue-50 dark:bg-blue-900/20"
        )}
        style={{ 
          backgroundColor: `${element.color}15`,
          borderLeft: `4px solid ${element.color}`
        }}
        onMouseEnter={() => onElementSelect(element.id)}
        onMouseLeave={() => onElementSelect(null)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="hover:bg-white/50 dark:hover:bg-gray-800/50 rounded p-1"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                )}
              </button>
            )}
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {element.title}
              </h3>
              {element.content && showScriptContent && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                  {element.content}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="ml-8 space-y-6">
          {element.children.map(child => (
            <OutlineNode
              key={child.id}
              element={child}
              level={level + 1}
              activeElementId={activeElementId}
              onElementSelect={onElementSelect}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              showScriptContent={showScriptContent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
