"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PanelsTopLeft, Loader2 } from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';

import { StoryLanes, type ScriptMarker } from "@/components/beat-board/StoryLanes";
import { OutlineDocument } from '@/components/outline-editor/OutlineDocument';

import { getFullProject, type FullProject } from "@/services/project";
import { getBeatBoardForProject, updateBeat, type Beat } from '@/services/beat';
import { type Lane, type OutlineItem, createLane, updateLane, updateLaneOrder, createOutlineItem, updateOutlineItem, deleteOutlineItem } from '@/services/beat-board';
import { useAuth } from '@/lib/AuthContext';

export interface StructureElement {
  id: string;
  title: string;
  content: string;
  color: string;
  startPage: number;
  endPage: number;
  type: string;
  children: StructureElement[];
  laneId?: string;
  laneLevel?: number;
  outlineId?: string;
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
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id") ?? "";
  const { user } = useAuth();

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
    if (!projectId || !user?.id) return;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [projectData, beatBoardData] = await Promise.all([
          getFullProject(projectId, user.id),
          getBeatBoardForProject(projectId)
        ]);
        setProject(projectData);
        const beats = beatBoardData.beats || [];
        setBeats(beats);
        setLanes((beatBoardData.lanes || []).sort((a, b) => a.order - b.order));

        const beatMap = new Map(beats.map(beat => [beat.id, beat]));
        const syncedOutlineItems = (beatBoardData.outlineItems || []).map(item => {
          const beat = beatMap.get(item.beatId);
          if (beat && beat.startPage && beat.endPage) {
            const correctPosition = ((beat.startPage - 1) / 119) * 100;
            const pageSpan = beat.endPage - beat.startPage;
            const correctWidth = (pageSpan / 119) * 100;

            const needsUpdate =
              Math.abs((item.timelinePosition || 0) - correctPosition) > 0.5 ||
              Math.abs((item.width || 0) - correctWidth) > 0.5;

            if (needsUpdate) {
              updateOutlineItem(item.id, {
                timelinePosition: correctPosition,
                width: correctWidth
              }).catch(err =>
                console.error("Failed to sync outline item position/width", err)
              );
              return { ...item, timelinePosition: correctPosition, width: correctWidth };
            }
          }
          return item;
        });

        setOutlineItems(syncedOutlineItems);
      } catch (err) { console.error("Failed to load data", err); setError("Failed to load project data."); }
      finally { setIsLoading(false); }
    };
    fetchData();
  }, [projectId, user?.id]);

  const transformedStructure = useMemo((): StructureElement[] => {
    if (lanes.length === 0 || beats.length === 0 || outlineItems.length === 0) return [];
    const beatMap = new Map(beats.map(beat => [beat.id, beat]));
    const laneOrderMap = new Map(lanes.map(lane => [lane.id, lane.order]));
    const allItems: StructureElement[] = outlineItems.map(item => {
      const beat = beatMap.get(item.beatId);
      let startPage = beat?.startPage || 0;
      let endPage = beat?.endPage || 0;
      if (startPage === 0 && beat?.sceneNumbers) {
        const pageRange = parsePageRange(beat.sceneNumbers);
        startPage = pageRange?.start || 0;
        endPage = pageRange?.end || 0;
      }
      return {
        id: item.beatId,
        title: beat?.title || '',
        content: beat?.description || '',
        color: beat?.color || '#e5e7eb',
        startPage,
        endPage,
        laneId: item.laneId,
        laneLevel: laneOrderMap.get(item.laneId) ?? -1,
        children: [],
        type: 'BEAT',
        outlineId: item.id,
      };
    }).filter(item => (item.laneLevel ?? -1) !== -1 && item.startPage > 0).sort((a, b) => a.startPage - b.startPage);

    const buildHierarchy = (parents: StructureElement[], potentialChildren: StructureElement[]): StructureElement[] => {
      // Collect all assigned children across all parents
      const assignedChildIds = new Set<string>();

      for (const parent of parents) {
        const directChildren = potentialChildren.filter(child =>
          !assignedChildIds.has(child.id) && // Not already assigned
          (child.laneLevel ?? -1) === (parent.laneLevel ?? -1) + 1 && // Immediate child level
          child.startPage >= parent.startPage && // Within parent's page range
          child.endPage <= parent.endPage
        );

        parent.children = directChildren;

        directChildren.forEach(child => assignedChildIds.add(child.id));
      }

      const remainingChildren = potentialChildren.filter(child => !assignedChildIds.has(child.id));

      for (const parent of parents) {
        if (parent.children.length > 0) {
          buildHierarchy(parent.children, remainingChildren);
        }
      }

      return parents;
    };

    const topLevelItems = allItems.filter(item => item.laneLevel === 0);
    const otherItems = allItems.filter(item => (item.laneLevel ?? 0) > 0);
    return buildHierarchy(topLevelItems, otherItems);
  }, [lanes, beats, outlineItems]);

  const scriptMarkers = useMemo((): ScriptMarker[] => {
    return [
      { name: 'Act 1: Setup', page: 1, color: "#10b981" },
      { name: 'Act 2: Confrontation', page: 30, color: "#8b5cf6" },
      { name: 'Act 3: Resolution', page: 90, color: "#ef4444" },
    ];
  }, []);

  const debouncedUpdateOutlineItem = useDebouncedCallback((itemId: string, data: Partial<OutlineItem>) => { updateOutlineItem(itemId, data) }, 500);

  const debouncedUpdateBeatSceneNumbers = useDebouncedCallback((beatId: string, timelinePosition: number, width: number) => {
    updateBeatSceneNumbers(beatId, timelinePosition, width);
  }, 500);

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
    let updatedItem: OutlineItem | undefined;

    setOutlineItems(prevItems => {
      const newItems = prevItems.map(item => item.id === itemId ? { ...item, ...updates } : item);
      updatedItem = newItems.find(item => item.id === itemId);

      if (updates.order !== undefined) {
        const changedItem = newItems.find(item => item.id === itemId);
        if (changedItem) return layoutLane(changedItem.laneId, newItems);
      }
      return newItems;
    });
    debouncedUpdateOutlineItem(itemId, updates);

    if ((updates.timelinePosition !== undefined || updates.width !== undefined) && updatedItem) {
      debouncedUpdateBeatSceneNumbers(updatedItem.beatId, updatedItem.timelinePosition ?? 0, updatedItem.width ?? 5);
    }
  };

  const handleDeleteOutlineItem = async (itemId: string) => {
    const item = outlineItems.find(i => i.id === itemId);
    if (!item) return;

    try {
      await deleteOutlineItem(itemId);
      setOutlineItems(prevItems => {
        const filtered = prevItems.filter(i => i.id !== itemId);
        return layoutLane(item.laneId, filtered);
      });
    } catch (err) {
      console.error("Failed to delete outline item", err);
    }
  };

  const handleDropOnTimeline = async (e: React.DragEvent, targetLaneId: string, targetItemId?: string) => {
    e.preventDefault();
    setHoveredLane(null);
    setDraggedLaneItem(null);
    const beatId = e.dataTransfer.getData("text/plain");
    const outlineItemId = e.dataTransfer.getData("application/x-outline-item-id");
    if (beatId) {
      const existingItem = outlineItems.find(item => item.beatId === beatId);
      if (existingItem) {
        console.warn("Beat already exists in a lane. Moving to new lane instead.");
        const finalItems: OutlineItem[] = [];
        const originalLaneId = existingItem.laneId;
        setOutlineItems(prevItems => {
          const allItems = prevItems.filter(item => item.id !== existingItem.id);
          const targetLaneItems = allItems.filter(item => item.laneId === targetLaneId).sort((a, b) => a.order - b.order);
          targetLaneItems.push({ ...existingItem, laneId: targetLaneId, order: targetLaneItems.length });
          const reorderedTargetLane = targetLaneItems.map((item, index) => ({ ...item, order: index }));
          const otherItems = allItems.filter(item => item.laneId !== targetLaneId);
          const updated = [...otherItems, ...reorderedTargetLane];
          const layouted = layoutLane(targetLaneId, updated);
          finalItems.push(...(originalLaneId !== targetLaneId ? layoutLane(originalLaneId, layouted) : layouted));
          return finalItems;
        });
        const movedItem = finalItems.find(item => item.id === existingItem.id);
        if (movedItem) {
          updateOutlineItem(existingItem.id, { laneId: movedItem.laneId, order: movedItem.order })
            .catch(err => console.error("Failed to move existing item", err));
          updateBeatSceneNumbers(beatId, movedItem.timelinePosition || 0, movedItem.width || 5);
        }
        return;
      }
      const currentLaneItems = outlineItems.filter(item => item.laneId === targetLaneId);
      const defaultWidth = (10 / 119) * 100;
      const newItemData: Partial<OutlineItem> = { beatId, laneId: targetLaneId, order: currentLaneItems.length, width: defaultWidth };
      try {
        const createdItem = await createOutlineItem(projectId, newItemData);
        let finalItems: OutlineItem[] = [];
        setOutlineItems(prevItems => {
          const updatedItems = [...prevItems, createdItem];
          finalItems = layoutLane(targetLaneId, updatedItems);
          return finalItems;
        });
        const positionedItem = finalItems.find(item => item.id === createdItem.id);
        if (positionedItem) {
          updateBeatSceneNumbers(beatId, positionedItem.timelinePosition || 0, positionedItem.width || 5);
        }
      } catch (err) { console.error("Failed to create outline item", err); }
    } else if (outlineItemId) {
      const draggedItem = outlineItems.find(item => item.id === outlineItemId);
      if (!draggedItem) return;
      let finalItems: OutlineItem[] = [];
      const originalLaneId = draggedItem.laneId;
      setOutlineItems(prevItems => {
        const allItems = prevItems.filter(item => item.id !== outlineItemId);
        const targetLaneItems = allItems.filter(item => item.laneId === targetLaneId).sort((a, b) => a.order - b.order);
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
        if (draggedItem.beatId) {
          updateBeatSceneNumbers(draggedItem.beatId, finalDraggedItemState.timelinePosition || 0, finalDraggedItemState.width || 5);
        }
      }
    }
  };

  const updateBeatSceneNumbers = (beatId: string, timelinePosition: number, width: number) => {
    const totalPages = 120; // Match the default from StoryLanes

    const startPageRaw = 1 + (timelinePosition / 100) * (totalPages - 1);
    const endPageRaw = 1 + ((timelinePosition + width) / 100) * (totalPages - 1);

    const startPage = Math.max(1, Math.round(startPageRaw));
    const endPage = Math.min(totalPages, Math.max(startPage, Math.round(endPageRaw)));

    const pageSpan = endPage - startPage;
    const correctWidth = (pageSpan / (totalPages - 1)) * 100;

    const sceneNumbers = startPage === endPage ? `Pg. ${startPage}` : `Pg. ${startPage}-${endPage}`;

    setBeats(prevBeats => prevBeats.map(beat =>
      beat.id === beatId ? { ...beat, startPage, endPage, sceneNumbers } : beat
    ));

    const item = outlineItems.find(i => i.beatId === beatId);
    if (item && Math.abs((item.width || 0) - correctWidth) > 0.1) {
      setOutlineItems(prevItems =>
        prevItems.map(i => i.beatId === beatId ? { ...i, width: correctWidth } : i)
      );
      updateOutlineItem(item.id, { width: correctWidth }).catch(err =>
        console.error("Failed to update outline item width", err)
      );
    }

    updateBeat(beatId, { startPage, endPage, sceneNumbers }).catch(err =>
      console.error("Failed to update beat pages", err)
    );
  };

  if (isLoading) return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="flex h-full w-full items-center justify-center text-red-500">{error}</div>;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-black">
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/projects/beat-board?id=${projectId}`}>
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to Beat Board</Button>
            </Link>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2">
              <PanelsTopLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{project?.title} - Outline Editor</h1>
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
          onDeleteOutlineItem={handleDeleteOutlineItem}
          onItemHover={setActiveElementId}
          totalPages={120}
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
