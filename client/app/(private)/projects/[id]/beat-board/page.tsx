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
import { FullProject } from "@/services/project"

// MOCK BACKEND SERVICES
async function createOutlineItem(projectId: string, data: Partial<OutlineItem>): Promise<OutlineItem> { console.log("Creating item for project:", projectId); return { id: `outline_${Date.now()}`, ...data } as OutlineItem }
async function updateOutlineItem(itemId: string, data: Partial<OutlineItem>): Promise<OutlineItem> { console.log(`UPDATING item ${itemId}`, data); return { id: itemId, ...data } as OutlineItem }
// ---

export type OutlineItem = {
  id: string; beatId: string; laneId: number; order: number;
  startPage?: number; endPage?: number; timelinePosition?: number; width?: number;
}
export type ConnectionSide = "top" | "right" | "bottom" | "left";

export default function BeatBoardPage() {
  const [project, setProject] = useState<FullProject | null>(null);
  const [beats, setBeats] = useState<Beat[]>([])
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
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
  const [hoveredLane, setHoveredLane] = useState<number | null>(null)
  const [newBeat, setNewBeat] = useState({ title: "", description: "", color: "#fef3c7" })
  const [draggedLaneItem, setDraggedLaneItem] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return;
    const fetchData = async () => {
      setIsLoading(true); setError(null);
      try {
        // @ts-ignore
        const { projectData, beats: fetchedBeats, connections: fetchedConnections, outlineItems: fetchedOutlineItems } =
          await getBeatBoardForProject(projectId);
        setProject(projectData);
        setBeats(fetchedBeats || []);
        setConnections(fetchedConnections || []);

        // Initialize layout for each lane
        const laneIds = new Set<number>((fetchedOutlineItems || []).map((item: OutlineItem) => item.laneId));
        let laidOutItems = [...(fetchedOutlineItems || [])];
        laneIds.forEach(laneId => {
          laidOutItems = layoutLane(laneId, laidOutItems);
        });
        setOutlineItems(laidOutItems);

      } catch (err) {
        setError("Failed to load beat board data."); console.error(err);
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

  const debouncedUpdate = useDebouncedCallback((beatId: string, data: Partial<Beat>) => { updateBeat(beatId, data) }, 800);
  const handleFieldChange = (beatId: string, field: keyof Beat, value: any) => { setBeats(beats.map(b => b.id === beatId ? { ...b, [field]: value } : b)); debouncedUpdate(beatId, { [field]: value }); };
  const snapToGrid = (value: number) => Math.round(value / 20) * 20;

  const handleAddBeat = () => {
    const beatData: Partial<Beat> = {
      title: newBeat.title || "Beat Title", description: newBeat.description || "Describe what happens...",
      color: newBeat.color, position: { x: snapToGrid(200), y: snapToGrid(200) }, width: 288, height: 192,
    };
    createBeat(projectId, beatData).then((createdBeat) => { setBeats((prev) => [...prev, createdBeat]); setNewBeat({ title: "", description: "", color: "#fef3c7" }); setIsAddingBeat(false); });
  };
  const handleDeleteBeat = (id: string) => { setBeats(beats.filter(b => b.id !== id)); setConnections(connections.filter(c => c.fromId !== id && c.toId !== id)); setOutlineItems(outlineItems.filter(item => item.beatId !== id)); deleteBeat(id); };
  const handleMouseDownOnBeat = (e: React.MouseEvent, beatId: string) => { if ((e.target as HTMLElement).closest(".resize-handle, .connection-handle, input, textarea, button, [draggable=true]")) return; setMovingBeatId(beatId); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top }); };
  const handleMouseMove = useCallback((e: React.MouseEvent) => { if (movingBeatId && boardRef.current) { const boardRect = boardRef.current.getBoundingClientRect(); const newX = snapToGrid(e.clientX - boardRect.left - dragOffset.x); const newY = snapToGrid(e.clientY - boardRect.top - dragOffset.y); setBeats(prev => prev.map(beat => beat.id === movingBeatId ? { ...beat, position: { x: Math.max(0, newX), y: Math.max(0, newY) } } : beat)); } else if (isResizing && boardRef.current) { const deltaX = e.clientX - resizeStartMousePos.x; const deltaY = e.clientY - resizeStartMousePos.y; setBeats(prev => prev.map(beat => { if (beat.id === isResizing) { const newWidth = snapToGrid(Math.max(200, resizeStartBeatSize.width + deltaX)); const newHeight = snapToGrid(Math.max(150, resizeStartBeatSize.height + deltaY)); return { ...beat, width: newWidth, height: newHeight }; } return beat; })); } if (isConnecting && connectionStart && boardRef.current) { const boardRect = boardRef.current.getBoundingClientRect(); setTempConnection({ x: e.clientX - boardRect.left, y: e.clientY - boardRect.top }); } }, [movingBeatId, dragOffset, isResizing, resizeStartMousePos, resizeStartBeatSize, isConnecting, connectionStart]);
  const handleMouseUp = () => { if (movingBeatId) { const beat = beats.find(b => b.id === movingBeatId); if (beat) debouncedUpdate(beat.id, { position: beat.position }); } if (isResizing) { const beat = beats.find(b => b.id === isResizing); if (beat) debouncedUpdate(beat.id, { width: beat.width, height: beat.height }); } setMovingBeatId(null); setIsResizing(null); };
  const handleDragStartOnBeat = (_: React.DragEvent, beatId: string) => { setDraggedBeat(beatId); };

  const layoutLane = (laneId: number, items: OutlineItem[]): OutlineItem[] => {
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

  const handleUpdateOutlineItem = (itemId: string, updates: Partial<OutlineItem>) => {
    setOutlineItems(prevItems => {
      let laneIdToUpdate: number | null = null;
      const updatedItems = prevItems.map(item => {
        if (item.id === itemId) {
          laneIdToUpdate = item.laneId;
          return { ...item, ...updates };
        }
        return item;
      });

      if (updates.order !== undefined && laneIdToUpdate !== null) {
        return layoutLane(laneIdToUpdate, updatedItems);
      }
      // If only width/position is changing, we don't need to re-layout the whole lane,
      // but it's safer to do so if overlaps are a concern. Re-layout is cheap.
      if (laneIdToUpdate !== null) {
        return layoutLane(laneIdToUpdate, updatedItems);
      }

      return updatedItems;
    });

    updateOutlineItem(itemId, updates);
  };

  // NEW: Consolidated drop handler for lanes
  const handleDropOnTimeline = (e: React.DragEvent, targetLaneId: number, targetItemId?: string) => {
    e.preventDefault();
    setHoveredLane(null);
    setDraggedLaneItem(null);

    const beatId = e.dataTransfer.getData("text/plain");
    const outlineItemId = e.dataTransfer.getData("application/x-outline-item-id");

    if (beatId) { // Case 1: Dropping a new beat from the canvas
      const newItemData: Partial<OutlineItem> = { beatId, laneId: targetLaneId, order: 0, width: 5 };
      createOutlineItem(projectId, newItemData).then(createdItem => {
        setOutlineItems(prevItems => {
          const targetLaneItems = prevItems.filter(item => item.laneId === targetLaneId);
          const otherLaneItems = prevItems.filter(item => item.laneId !== targetLaneId);
          // Simple logic: add to the end
          createdItem.order = targetLaneItems.length;
          const newLaneItems = [...targetLaneItems, createdItem];
          const updatedItems = [...otherLaneItems, ...newLaneItems];
          return layoutLane(targetLaneId, updatedItems);
        });
      });
    } else if (outlineItemId) { // Case 2: Moving an existing outline item
      setOutlineItems(prevItems => {
        const draggedItem = prevItems.find(item => item.id === outlineItemId);
        if (!draggedItem) return prevItems;

        const originalLaneId = draggedItem.laneId;
        let allItems = [...prevItems];

        // --- Reorder logic ---
        // 1. Remove item from its original position
        allItems = allItems.filter(item => item.id !== outlineItemId);

        // 2. Determine new order and insert into target lane's items
        let targetLaneItems = allItems.filter(item => item.laneId === targetLaneId).sort((a, b) => a.order - b.order);
        const targetItemIndex = targetItemId ? targetLaneItems.findIndex(item => item.id === targetItemId) : -1;

        // Insert at the target index, or at the end if no specific target
        const insertIndex = targetItemIndex !== -1 ? targetItemIndex : targetLaneItems.length;
        targetLaneItems.splice(insertIndex, 0, { ...draggedItem, laneId: targetLaneId });

        // 3. Re-assign order for the target lane
        const reorderedTargetLane = targetLaneItems.map((item, index) => ({ ...item, order: index }));

        // 4. Combine with other items
        const otherItems = allItems.filter(item => item.laneId !== targetLaneId);
        let finalItems = [...otherItems, ...reorderedTargetLane];

        // 5. Re-layout both the target lane and, if different, the original lane
        finalItems = layoutLane(targetLaneId, finalItems);
        if (originalLaneId !== targetLaneId) {
          finalItems = layoutLane(originalLaneId, finalItems);
        }

        return finalItems;
      });
      updateOutlineItem(outlineItemId, { laneId: targetLaneId }); // Persist the lane change
    }
  };


  const handleLaneDragStart = (_: React.DragEvent, itemId: string) => { setDraggedLaneItem(itemId); };
  const handleResizeMouseDown = (e: React.MouseEvent, beatId: string) => { e.stopPropagation(); setIsResizing(beatId); setResizeStartMousePos({ x: e.clientX, y: e.clientY }); const beat = beats.find(b => b.id === beatId); if (beat) setResizeStartBeatSize({ width: beat.width, height: beat.height }); };
  const handleDoubleClick = (beatId: string, field: keyof Beat) => setEditingField({ beatId, field });
  const handleFieldBlur = () => { if (editingField) debouncedUpdate.flush(); setEditingField(null); };
  const handleChangeColor = (beatId: string, color: string) => { setBeats(beats.map(b => b.id === beatId ? { ...b, color } : b)); setColorPickerOpen(null); updateBeat(beatId, { color }); };
  const handleConnectionStart = (e: React.MouseEvent, beatId: string, side: ConnectionSide) => { e.stopPropagation(); setIsConnecting(true); setConnectionStart({ beatId, side }); };
  const handleConnectionEnd = (beatId: string, side: ConnectionSide) => { if (connectionStart && connectionStart.beatId !== beatId) { createConnection(projectId, { fromId: connectionStart.beatId, toId: beatId, fromSide: connectionStart.side, toSide: side }).then(newConnection => setConnections(prev => [...prev, newConnection])); } setIsConnecting(false); setConnectionStart(null); setTempConnection(null); };
  const handleDeleteConnection = (id: string) => { setConnections(connections.filter(c => c.id !== id)); deleteConnection(id); };

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
          <Button onClick={() => setIsAddingBeat(true)} className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-2" />New Beat</Button>
        </div>
        {/* UPDATED: Pass the new handler to StoryLanes */}
        <StoryLanes
          beats={beats} outlineItems={outlineItems} hoveredLane={hoveredLane}
          draggedLaneItem={draggedLaneItem} setHoveredLane={setHoveredLane}
          handleDropOnTimeline={handleDropOnTimeline}
          handleLaneDragStart={handleLaneDragStart}
          setDraggedLaneItem={setDraggedLaneItem}
          onUpdateOutlineItem={handleUpdateOutlineItem} scriptMarkers={scriptMarkers} />
      </div>
      <BeatCanvas
        boardRef={boardRef} beats={beats} connections={connections} isLoading={isLoading}
        editingField={editingField} colorPickerOpen={colorPickerOpen} draggedBeat={draggedBeat}
        movingBeatId={movingBeatId} isResizing={isResizing}
        onMouseDownOnBeat={handleMouseDownOnBeat} onDragStartOnBeat={handleDragStartOnBeat}
        onDragEndOnBeat={() => setDraggedBeat(null)} onResizeMouseDown={handleResizeMouseDown}
        handleFieldChange={handleFieldChange} handleDoubleClick={handleDoubleClick}
        handleFieldBlur={handleFieldBlur} setColorPickerOpen={setColorPickerOpen}
        handleChangeColor={handleChangeColor} handleDeleteBeat={handleDeleteBeat}
        handleConnectionStart={handleConnectionStart} handleConnectionEnd={handleConnectionEnd}
        handleDeleteConnection={handleDeleteConnection} tempConnection={tempConnection}
        isConnecting={isConnecting} connectionStart={connectionStart} />
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
