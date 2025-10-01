import React from 'react';
import { OutlineNode } from './OutlineNode';
import { type StructureElement } from '@/app/(private)/projects/[id]/outline-editor/page';

interface OutlineDocumentProps {
  structure: StructureElement[];
  activeElementId: string | null;
  onElementSelect: (id: string | null) => void;
}

export function OutlineDocument({ structure, activeElementId, onElementSelect }: OutlineDocumentProps) {
  return (
    <div className="flex-1 overflow-y-auto p-8 bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-4xl mx-auto bg-white dark:bg-gray-800 shadow-lg p-12 font-serif">
        {structure.length > 0 ? (
          structure.map(element => (
            <OutlineNode
              key={element.id}
              element={element}
              level={0}
              activeElementId={activeElementId}
              onElementSelect={onElementSelect}
            />
          ))
        ) : (
          <div className="text-center text-gray-500">No outline structure to display. Check that your beats have page numbers and are assigned to lanes.</div>
        )}
      </div>
    </div>
  );
}
