import { OutlineNode } from './OutlineNode';
import { type StructureElement } from '@/app/(private)/projects/[id]/outline-editor/page';

interface OutlineDocumentProps {
  structure: StructureElement[];
  activeElementId: string | null;
  onElementSelect: (id: string | null) => void;
}

export function OutlineDocument({ structure, activeElementId, onElementSelect }: OutlineDocumentProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-gray-800">
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="bg-white dark:bg-gray-900 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-8">
            {structure.length > 0 ? (
              structure.map(element => (
                <OutlineNode
                  key={element.id}
                  element={element}
                  level={0}
                  activeElementId={activeElementId}
                  onElementSelect={onElementSelect}
                  showScriptContent={true}
                />
              ))
            ) : (
              <div className="text-center text-gray-500 p-12">
                No outline structure to display. Add beats to lanes in the Beat Board to build your outline.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
