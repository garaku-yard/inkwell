import React from 'react';
import { OutlineNode } from './OutlineNode';
import { type LaneWithBeats } from '@/app/(private)/projects/[id]/outline-editor/page';

interface OutlineDocumentProps {
  lanesWithBeats: LaneWithBeats[];
  activeElementId: string | null;
  onElementSelect: (id: string | null) => void;
}

export function OutlineDocument({ lanesWithBeats, activeElementId, onElementSelect }: OutlineDocumentProps) {
  return (
    <div className="flex-1 overflow-y-auto p-8 bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-4xl mx-auto bg-white dark:bg-gray-800 shadow-lg p-12 font-serif">
        {lanesWithBeats.map(lane => (
          <div key={lane.id} className="mb-12">
            <h2 className="text-2xl font-bold border-b-2 pb-2 mb-6" style={{ borderColor: lane.color }}>
              {lane.name}
            </h2>
            {lane.beats.length > 0 ? (
              lane.beats.map(beat => (
                <OutlineNode
                  key={beat.id}
                  beat={beat}
                  isActive={activeElementId === beat.id}
                  onElementSelect={onElementSelect}
                />
              ))
            ) : (
              <p className="text-sm text-gray-500 italic">No beats in this lane.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
