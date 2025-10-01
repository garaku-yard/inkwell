"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PanelsTopLeft, Loader2 } from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';

import { StoryLanes, type ScriptMarker } from "@/components/beat-board/StoryLanes";
import { OutlineDocument } from '@/components/outline-editor/OutlineDocument';

import { getProjectById, type FullProject } from "@/services/project";
import { getBeatBoardForProject, type Beat } from '@/services/beat';
import { type Lane, type OutlineItem, createLane, updateLane, updateLaneOrder, createOutlineItem, updateOutlineItem } from '@/services/beat-board';

export interface StructureElement {
  id: string;
  title: string;
  content: string;
  color: string;
  startPage: number;
  endPage: number;
  children: StructureElement[];
  laneId?: string;
  laneLevel?: number;
}

const parsePageRange = (sceneNumbers: string): { start: number; end: number } | null => {
  if (!sceneNumbers) return null;
  const cleaned = sceneNumbers.replace(/Pg\.\s*/i, '');
  const parts = cleaned.split('-').map(p => parseInt(p.trim(), 10));
  if (parts.length === 1 && !isNaN(parts[0])) return { start: parts[0], end: parts[0] };
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return { start: parts[0], end: parts[1] };
  return null;
};

export default function OutlineEditorPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<FullProject | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeElementId, setActiveElementId] = useState<string | null>(null);

  const [draggedLaneId, setDraggedLaneId] = useState<string | null>(null);
  const [hoveredLane, setHoveredLane] = useState<string | null>(null);
  const [draggedLaneItem, setDraggedLaneItem] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [projectData, beatBoardData] = await Promise.all([
          getProjectById(projectId),
          getBeatBoardForProject(projectId)
        ]);
        setProject(projectData);
        setBeats(beatBoardData.beats || []);
        setLanes((beatBoardData.lanes || []).sort((a, b) => a.order - b.order));
        setOutlineItems(beatBoardData.outlineItems || []);
      } catch (err) { console.error("Failed to load data", err); setError("Failed to load project data."); }
      finally { setIsLoading(false); }
    };
    fetchData();
  }, [projectId]);

  const transformedStructure = useMemo((): StructureElement[] => {
    if (lanes.length === 0 || beats.length === 0 || outlineItems.length === 0) return [];
    const beatMap = new Map(beats.map(beat => [beat.id, beat]));
    const laneOrderMap = new Map(lanes.map((lane, index) => [lane.id, index]));
    const allItems: StructureElement[] = outlineItems.map(item => {
      const beat = beatMap.get(item.beatId);
      const pageRange = beat ? parsePageRange(beat.sceneNumbers) : null;
      return {
        id: item.beatId,
        title: beat?.title || '',
        content: beat?.description || '',
        color: beat?.color || '#e5e7eb',
        startPage: pageRange?.start || 0,
        endPage: pageRange?.end || 0,
        laneId: item.laneId,
        laneLevel: laneOrderMap.get(item.laneId) ?? -1,
        children: [],
      };
    }).filter(item => (item.laneLevel ?? -1) !== -1 && item.startPage > 0).sort((a, b) => a.startPage - b.startPage);

    const buildHierarchy = (parents: StructureElement[], potentialChildren: StructureElement[]): StructureElement[] => {
      let availableChildren = [...potentialChildren];

      // First pass: Assign direct children to each parent from the available pool.
      for (const parent of parents) {
        const directChildren = availableChildren.filter(child =>
          (child.laneLevel ?? -1) === (parent.laneLevel ?? -1) + 1 &&
          child.startPage >= parent.startPage &&
          child.endPage <= parent.endPage
        );

        parent.children = directChildren;

        // Remove assigned children from the pool so they can't be parented by a sibling.
        availableChildren = availableChildren.filter(child => !directChildren.some(dc => dc.id === child.id));
      }

      // Second pass: Recurse for each parent's newly assigned children.
      for (const parent of parents) {
        if (parent.children.length > 0) {
          // The pool for the grandchildren is what remains after all parents at this level have claimed their children.
          buildHierarchy(parent.children, availableChildren);
        }
      }

      return parents;
    };

    const topLevelItems = allItems.filter(item => item.laneLevel === 0);
    const otherItems = allItems.filter(item => (item.laneLevel ?? 0) > 0);
    return buildHierarchy(topLevelItems, otherItems);
  }, [lanes, beats, outlineItems]);

  const scriptMarkers = useMemo((): ScriptMarker[] => {
    if (!project?.acts) return [];
    return project.acts.map(act => ({ name: `Act ${act.actNumber}`, page: (act.actNumber - 1) * 30 + 1, color: "#10b981" }));
  }, [project?.acts]);

  const debouncedUpdateOutlineItem = useDebouncedCallback((itemId: string, data: Partial<OutlineItem>) => { updateOutlineItem(itemId, data) }, 500);

  const layoutLane = (laneId: string, items: OutlineItem[]): OutlineItem[] => {
    const laneItems = items.filter(item => item.laneId === laneId).sort((a, b) => a.order - b.order);
    let currentPosition = 0;
    const gapPercentage = 0.5;
    const updatedLaneItemsWithLayout = laneItems.map(item => {
      const newItem = { ...item, timelinePosition: currentPosition };
      currentPosition += (item.width || 5) + gapPercentage;
      return newItem;
    });
    const otherItems = items.filter(item => item.laneId !== laneId);
    return [...otherItems, ...updatedLaneItemsWithLayout];
  };

  const handleAddLane = async () => {
    const newLaneData: Partial<Lane> = { name: "New Lane", color: "#e5e7eb", order: lanes.length };
    try {
      const createdLane = await createLane(projectId, newLaneData);
      setLanes(currentLanes => [...currentLanes, createdLane]);
    } catch (err) { console.error("Failed to create new lane", err); }
  };

  const handleUpdateLane = (laneId: string, updates: Partial<Lane>) => {
    setLanes(currentLanes => currentLanes.map(lane => lane.id === laneId ? { ...lane, ...updates } : lane));
    updateLane(laneId, updates).catch(err => console.error("Failed to update lane name", err));
  };

  const handleLaneDrop = (targetLaneId: string) => {
    if (draggedLaneId === null || draggedLaneId === targetLaneId) return;
    let newLanes: Lane[] = [];
    setLanes(currentLanes => {
      const draggedLaneIndex = currentLanes.findIndex(l => l.id === draggedLaneId);
      const targetLaneIndex = currentLanes.findIndex(l => l.id === targetLaneId);
      newLanes = [...currentLanes];
      const [draggedLane] = newLanes.splice(draggedLaneIndex, 1);
      newLanes.splice(targetLaneIndex, 0, draggedLane);
      return newLanes;
    });
    const orderedIds = newLanes.map(l => l.id);
    updateLaneOrder(projectId, orderedIds).catch(err => console.error("Failed to update lane order", err));
    setDraggedLaneId(null);
  };

  const handleUpdateOutlineItem = (itemId: string, updates: Partial<OutlineItem>) => {
    setOutlineItems(prevItems => {
      const newItems = prevItems.map(item => item.id === itemId ? { ...item, ...updates } : item);
      if (updates.order !== undefined) {
        const changedItem = newItems.find(item => item.id === itemId);
        if (changedItem) return layoutLane(changedItem.laneId, newItems);
      }
      return newItems;
    });
    debouncedUpdateOutlineItem(itemId, updates);
  };

  const handleDropOnTimeline = async (e: React.DragEvent, targetLaneId: string, targetItemId?: string) => {
    e.preventDefault();
    setHoveredLane(null);
    setDraggedLaneItem(null);
    const beatId = e.dataTransfer.getData("text/plain");
    const outlineItemId = e.dataTransfer.getData("application/x-outline-item-id");
    if (beatId) {
      const currentLaneItems = outlineItems.filter(item => item.laneId === targetLaneId);
      const newItemData: Partial<OutlineItem> = { projectId, beatId, laneId: targetLaneId, order: currentLaneItems.length, width: 5 };
      try {
        const createdItem = await createOutlineItem(newItemData);
        setOutlineItems(prevItems => {
          const updatedItems = [...prevItems, createdItem];
          return layoutLane(targetLaneId, updatedItems);
        });
      } catch (err) { console.error("Failed to create outline item", err); }
    } else if (outlineItemId) {
      const draggedItem = outlineItems.find(item => item.id === outlineItemId);
      if (!draggedItem) return;
      let finalItems: OutlineItem[] = [];
      const originalLaneId = draggedItem.laneId;
      setOutlineItems(prevItems => {
        let allItems = prevItems.filter(item => item.id !== outlineItemId);
        let targetLaneItems = allItems.filter(item => item.laneId === targetLaneId).sort((a, b) => a.order - b.order);
        const targetItemIndex = targetItemId ? targetLaneItems.findIndex(item => item.id === targetItemId) : -1;
        const insertIndex = targetItemIndex !== -1 ? targetItemIndex : targetLaneItems.length;
        targetLaneItems.splice(insertIndex, 0, { ...draggedItem, laneId: targetLaneId });
        const reorderedTargetLane = targetLaneItems.map((item, index) => ({ ...item, order: index }));
        const otherItems = allItems.filter(item => item.laneId !== targetLaneId);
        finalItems = [...otherItems, ...reorderedTargetLane];
        finalItems = layoutLane(targetLaneId, finalItems);
        if (originalLaneId !== targetLaneId) finalItems = layoutLane(originalLaneId, finalItems);
        return finalItems;
      });
      const finalDraggedItemState = finalItems.find(item => item.id === outlineItemId);
      if (finalDraggedItemState) {
        updateOutlineItem(outlineItemId, { laneId: finalDraggedItemState.laneId, order: finalDraggedItemState.order })
          .catch(err => console.error("Failed to update moved item", err));
      }
    }
  };

  if (isLoading) return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="flex h-screen w-full items-center justify-center text-red-500">{error}</div>;

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/projects/${projectId}/beat-board`}>
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to Beat Board</Button>
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <PanelsTopLeft className="h-5 w-5 text-gray-700" />
              <h1 className="text-xl font-semibold text-gray-900">{project?.projectName} - Outline Editor</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <StoryLanes
          lanes={lanes}
          beats={beats}
          outlineItems={outlineItems}
          scriptMarkers={scriptMarkers}
          draggedLaneId={draggedLaneId}
          hoveredLane={hoveredLane}
          setHoveredLane={setHoveredLane}
          draggedLaneItem={draggedLaneItem}
          setDraggedLaneItem={setDraggedLaneItem}
          onAddLane={handleAddLane}
          onUpdateLane={handleUpdateLane}
          onLaneDrop={handleLaneDrop}
          onLaneDragStart={(_e, laneId) => setDraggedLaneId(laneId)}
          onLaneDragEnd={() => setDraggedLaneId(null)}
          handleDropOnTimeline={handleDropOnTimeline}
          handleLaneDragStart={(_e, itemId) => setDraggedLaneItem(itemId)}
          onUpdateOutlineItem={handleUpdateOutlineItem}
          onItemHover={setActiveElementId}
        />
        <OutlineDocument
          structure={transformedStructure}
          activeElementId={activeElementId}
          onElementSelect={setActiveElementId}
        />
      </div>
    </div>
  );
}
