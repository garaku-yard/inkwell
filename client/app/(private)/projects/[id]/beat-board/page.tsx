"use client"
import type React from "react"
import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
import { ArrowLeft, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { StoryLanes, type ScriptMarker } from "@/components/beat-board/StoryLanes";
import { BeatCanvas } from "@/components/beat-board/BeatCanvas";

import { getBeatBoardForProject, createBeat, deleteBeat, updateBeat, createConnection, deleteConnection, type Beat, type Connection } from "@/services/beat"
import { type Lane, type OutlineItem, updateLane, updateLaneOrder, createOutlineItem, updateOutlineItem, createLane } from "@/services/beat-board";
import { getProjectById, type FullProject } from "@/services/project"

export type ConnectionSide = "top" | "right" | "bottom" | "left";

export default function BeatBoardPage() {
  const [project, setProject] = useState<FullProject | null>(null);
  const [beats, setBeats] = useState<Beat[]>([])
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [lanes, setLanes] = useState<Lane[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const params = useParams()
  const projectId = params.id as string

  const [isAddingBeat, setIsAddingBeat] = useState(false)
  const [editingField, setEditingField] = useState<{ beatId: string; field: keyof Beat } | null>(null)
  const [draggedBeat, setDraggedBeat] = useState<string | null>(null)
  const [movingBeatId, setMovingBeatId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState<string | null>(null)
  const [resizeStartMousePos, setResizeStartMousePos] = useState({ x: 0, y: 0 })
  const [resizeStartBeatSize, setResizeStartBeatSize] = useState({ width: 0, height: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStart, setConnectionStart] = useState<{ beatId: string; side: ConnectionSide } | null>(null)
  const [tempConnection, setTempConnection] = useState<{ x: number; y: number } | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [hoveredLane, setHoveredLane] = useState<string | null>(null)
  const [newBeat, setNewBeat] = useState({ title: "", description: "", color: "#fef3c7" })
  const [draggedLaneItem, setDraggedLaneItem] = useState<string | null>(null)
  const [draggedLaneId, setDraggedLaneId] = useState<string | null>(null);

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
        setConnections(beatBoardData.connections || []);
        setLanes(beatBoardData.lanes || []);
        setOutlineItems(beatBoardData.outlineItems || []);

      } catch (err) {
        setError("Failed to load beat board data.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [projectId]);

  const scriptMarkers = useMemo((): ScriptMarker[] => {
    if (!project?.acts) return [];
    const actMarkers: ScriptMarker[] = [
      { name: `Act 1: ${project.acts[0]?.title || 'Setup'}`, page: 1, color: "#10b981" },
      { name: `Act 2: ${project.acts[1]?.title || 'Confrontation'}`, page: 30, color: "#8b5cf6" },
      { name: `Act 3: ${project.acts[2]?.title || 'Resolution'}`, page: 90, color: "#ef4444" },
    ]
    return actMarkers.filter(act => project.acts.some(a => a.actNumber === parseInt(act.name.charAt(4))));
  }, [project?.acts]);

  const debouncedUpdateBeat = useDebouncedCallback((beatId: string, data: Partial<Beat>) => { updateBeat(beatId, data) }, 800);
  const debouncedUpdateOutlineItem = useDebouncedCallback((itemId: string, data: Partial<OutlineItem>) => { updateOutlineItem(itemId, data) }, 500);

  const snapToGrid = (value: number) => Math.round(value / 20) * 20;

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

  const handleUpdateLane = (laneId: string, updates: Partial<Lane>) => {
    setLanes(currentLanes =>
      currentLanes.map(lane =>
        lane.id === laneId ? { ...lane, ...updates } : lane
      )
    );
    updateLane(laneId, updates).catch(err => {
      console.error("Failed to update lane name", err);
    });
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
    updateLaneOrder(projectId, orderedIds).catch(err => {
      console.error("Failed to update lane order", err);
    });
    setDraggedLaneId(null);
  };

  const handleAddLane = async () => {
    const newLaneData: Partial<Lane> = {
      name: "New Lane",
      color: "#e5e7eb", // A default color
      order: lanes.length, // Add it to the end
    };

    try {
      // The backend needs a projectId, which is available in this component
      const createdLane = await createLane(projectId, newLaneData);
      setLanes(currentLanes => [...currentLanes, createdLane]);
    } catch (err) {
      console.error("Failed to create new lane", err);
      // Optionally show an error message to the user
    }
  };

  const handleUpdateOutlineItem = (itemId: string, updates: Partial<OutlineItem>) => {
    setOutlineItems(prevItems => {
      const newItems = prevItems.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      );
      if (updates.order !== undefined) {
        const changedItem = newItems.find(item => item.id === itemId);
        if (changedItem) {
          return layoutLane(changedItem.laneId, newItems);
        }
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
      const newItemData: Partial<OutlineItem> = {
        projectId, beatId, laneId: targetLaneId, order: currentLaneItems.length, width: 5,
      };
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
        if (originalLaneId !== targetLaneId) {
          finalItems = layoutLane(originalLaneId, finalItems);
        }
        return finalItems;
      });
      const finalDraggedItemState = finalItems.find(item => item.id === outlineItemId);
      if (finalDraggedItemState) {
        updateOutlineItem(outlineItemId, { laneId: finalDraggedItemState.laneId, order: finalDraggedItemState.order })
          .catch(err => console.error("Failed to update moved item", err));
      }
    }
  };

  const handleAddBeat = () => {
    const beatData: Partial<Beat> = {
      title: newBeat.title || "Beat Title", description: newBeat.description || "Describe what happens...",
      color: newBeat.color, position: { x: snapToGrid(200), y: snapToGrid(200) }, width: 288, height: 192,
    };
    createBeat(projectId, beatData).then((createdBeat) => { setBeats((prev) => [...prev, createdBeat]); setNewBeat({ title: "", description: "", color: "#fef3c7" }); setIsAddingBeat(false); });
  };

  const handleDeleteBeat = (id: string) => {
    deleteBeat(id).then(() => {
      setBeats(beats.filter(b => b.id !== id));
      setConnections(connections.filter(c => c.fromId !== id && c.toId !== id));
      setOutlineItems(outlineItems.filter(item => item.beatId !== id));
    }).catch(err => console.error("Failed to delete beat", err));
  };

  const handleFieldChange = (beatId: string, field: keyof Beat, value: any) => {
    setBeats(beats.map(b => b.id === beatId ? { ...b, [field]: value } : b));
    debouncedUpdateBeat(beatId, { [field]: value });
  };

  const handleChangeColor = (beatId: string, color: string) => {
    setBeats(beats.map(b => b.id === beatId ? { ...b, color } : b));
    setColorPickerOpen(null);
    updateBeat(beatId, { color });
  };

  const handleMouseDownOnBeat = (e: React.MouseEvent, beatId: string) => {
    if ((e.target as HTMLElement).closest(".resize-handle, .connection-handle, input, textarea, button, [draggable=true]")) return;
    setMovingBeatId(beatId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (movingBeatId && boardRef.current) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const newX = snapToGrid(e.clientX - boardRect.left - dragOffset.x);
      const newY = snapToGrid(e.clientY - boardRect.top - dragOffset.y);
      setBeats(prev => prev.map(beat => beat.id === movingBeatId ? { ...beat, position: { x: Math.max(0, newX), y: Math.max(0, newY) } } : beat));
    } else if (isResizing && boardRef.current) {
      const deltaX = e.clientX - resizeStartMousePos.x;
      const deltaY = e.clientY - resizeStartMousePos.y;
      setBeats(prev => prev.map(beat => {
        if (beat.id === isResizing) {
          const newWidth = snapToGrid(Math.max(200, resizeStartBeatSize.width + deltaX));
          const newHeight = snapToGrid(Math.max(150, resizeStartBeatSize.height + deltaY));
          return { ...beat, width: newWidth, height: newHeight };
        }
        return beat;
      }));
    }
    if (isConnecting && connectionStart && boardRef.current) {
      const boardRect = boardRef.current.getBoundingClientRect();
      setTempConnection({ x: e.clientX - boardRect.left, y: e.clientY - boardRect.top });
    }
  }, [movingBeatId, dragOffset, isResizing, resizeStartMousePos, resizeStartBeatSize, isConnecting, connectionStart]);

  const handleMouseUp = () => {
    if (movingBeatId) {
      const beat = beats.find(b => b.id === movingBeatId);
      if (beat) debouncedUpdateBeat(beat.id, { position: beat.position });
    }
    if (isResizing) {
      const beat = beats.find(b => b.id === isResizing);
      if (beat) debouncedUpdateBeat(beat.id, { width: beat.width, height: beat.height });
    }
    setMovingBeatId(null);
    setIsResizing(null);
  };

  const handleResizeMouseDown = (e: React.MouseEvent, beatId: string) => {
    e.stopPropagation();
    setIsResizing(beatId);
    setResizeStartMousePos({ x: e.clientX, y: e.clientY });
    const beat = beats.find(b => b.id === beatId);
    if (beat) setResizeStartBeatSize({ width: beat.width, height: beat.height });
  };

  const handleFieldBlur = () => {
    if (editingField) debouncedUpdateBeat.flush();
    setEditingField(null);
  };

  const handleConnectionStart = (e: React.MouseEvent, beatId: string, side: ConnectionSide) => {
    e.stopPropagation();
    setIsConnecting(true);
    setConnectionStart({ beatId, side });
  };

  const handleConnectionEnd = (beatId: string, side: ConnectionSide) => {
    if (connectionStart && connectionStart.beatId !== beatId) {
      createConnection(projectId, { fromId: connectionStart.beatId, toId: beatId, fromSide: connectionStart.side, toSide: side })
        .then(newConnection => setConnections(prev => [...prev, newConnection]));
    }
    setIsConnecting(false);
    setConnectionStart(null);
    setTempConnection(null);
  };

  if (isLoading) return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  if (error) return <div>{error}</div>;

  return (
    <div className="h-screen flex flex-col bg-white" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div className="border-b border-gray-200 bg-white z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/projects/${projectId}/editor`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to Editor</Button></Link>
            <div className="h-6 w-px bg-gray-200" />
            <h1 className="text-xl font-semibold text-gray-900">{project?.projectName || 'Beat Board'}</h1>
          </div>
          <Button onClick={() => setIsAddingBeat(true)}><Plus className="h-4 w-4 mr-2" />New Beat</Button>
        </div>
        <StoryLanes
          onAddLane={handleAddLane}
          lanes={lanes}
          draggedLaneId={draggedLaneId}
          onUpdateLane={handleUpdateLane}
          onLaneDragStart={(_e, laneId) => setDraggedLaneId(laneId)}
          onLaneDrop={handleLaneDrop}
          onLaneDragEnd={() => setDraggedLaneId(null)}
          beats={beats} outlineItems={outlineItems} hoveredLane={hoveredLane}
          draggedLaneItem={draggedLaneItem} setHoveredLane={setHoveredLane}
          handleDropOnTimeline={handleDropOnTimeline}
          handleLaneDragStart={(_e, itemId) => setDraggedLaneItem(itemId)}
          setDraggedLaneItem={setDraggedLaneItem}
          onUpdateOutlineItem={handleUpdateOutlineItem} scriptMarkers={scriptMarkers}
        />
      </div>
      <BeatCanvas
        boardRef={boardRef} beats={beats} connections={connections} isLoading={isLoading}
        editingField={editingField} colorPickerOpen={colorPickerOpen} draggedBeat={draggedBeat}
        movingBeatId={movingBeatId} isResizing={isResizing}
        onMouseDownOnBeat={handleMouseDownOnBeat}
        onDragStartOnBeat={(_e, beatId) => setDraggedBeat(beatId)}
        onDragEndOnBeat={() => setDraggedBeat(null)}
        onResizeMouseDown={handleResizeMouseDown}
        handleFieldChange={handleFieldChange}
        handleDoubleClick={(beatId, field) => setEditingField({ beatId, field })}
        handleFieldBlur={handleFieldBlur}
        setColorPickerOpen={setColorPickerOpen}
        handleChangeColor={handleChangeColor}
        handleDeleteBeat={handleDeleteBeat}
        handleConnectionStart={handleConnectionStart}
        handleConnectionEnd={handleConnectionEnd}
        handleDeleteConnection={deleteConnection}
        tempConnection={tempConnection}
        isConnecting={isConnecting}
        connectionStart={connectionStart}
      />
      <Dialog open={isAddingBeat} onOpenChange={setIsAddingBeat}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add New Beat</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="title" className="text-right">Title</Label><Input id="title" value={newBeat.title} onChange={(e) => setNewBeat({ ...newBeat, title: e.target.value })} className="col-span-3" placeholder="A brief, active title" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="description" className="text-right">Description</Label><Textarea id="description" value={newBeat.description} onChange={(e) => setNewBeat({ ...newBeat, description: e.target.value })} className="col-span-3" placeholder="What happens in this beat?" /></div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setIsAddingBeat(false)}>Cancel</Button><Button onClick={handleAddBeat}>Add Beat</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
