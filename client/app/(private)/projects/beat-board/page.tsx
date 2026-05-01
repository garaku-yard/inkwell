"use client"

import type React from "react"
import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
import { ArrowLeft, LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StoryLanes, type ScriptMarker } from "@/components/beat-board/StoryLanes";
import { BeatCanvas } from "@/components/beat-board/BeatCanvas";
import { PaneSpinner } from "@/components/shared/PaneSpinner";

import { getBeatBoardForProject, createBeat, deleteBeat, updateBeat, createConnection, deleteConnection, type Beat, type Connection } from "@/services/beat"
import { type Lane, type OutlineItem, updateLane, updateLaneOrder, createOutlineItem, updateOutlineItem, createLane } from "@/services/beat-board";
import { getProjectById, type FullProject } from "@/services/project"
import { useAuth } from "@/lib/AuthContext"
import { getCategoryStructure } from "@/lib/helpers/category-structure"

export type ConnectionSide = "top" | "right" | "bottom" | "left";

export default function BeatBoardPage() {
  const { user } = useAuth()
  const [project, setProject] = useState<FullProject | null>(null);
  const [beats, setBeats] = useState<Beat[]>([])
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [lanes, setLanes] = useState<Lane[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const searchParams = useSearchParams()
  const projectId = searchParams.get("id") ?? ""

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
  const [draggedLaneItem, setDraggedLaneItem] = useState<string | null>(null)
  const [draggedLaneId, setDraggedLaneId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !user?.id) return;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [projectData, beatBoardData] = await Promise.all([
          getProjectById(projectId, user.id),
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

  const structure = useMemo(() => getCategoryStructure(project?.category), [project?.category]);

  const scriptMarkers = useMemo((): ScriptMarker[] =>
    structure.sections.map(s => ({ name: s.name, page: s.unit, color: s.color })),
  [structure]);

  const debouncedUpdateBeat = useDebouncedCallback((beatId: string, data: Partial<Beat>) => { updateBeat(beatId, data) }, 800);
  const debouncedUpdateOutlineItem = useDebouncedCallback((itemId: string, data: Partial<OutlineItem>) => { updateOutlineItem(itemId, data) }, 500);

  const snapToGrid = (value: number) => Math.round(value / 20) * 20;

  const TOTAL_PAGES = structure.totalUnits;
  const getPageFromPosition = (position: number) => Math.max(1, Math.round((position / 100) * TOTAL_PAGES));
  const getPositionFromPage = (page: number) => ((page - 1) / TOTAL_PAGES) * 100;
  const getWidthFromPages = (startPage: number, endPage: number) => ((endPage - startPage + 1) / TOTAL_PAGES) * 100;

  const handleAddBeat = (position: { x: number; y: number }) => {
    const beatData: Partial<Beat> = {
      title: "New Beat",
      description: "",
      startPage: 1,
      endPage: 1,
      color: "#fef3c7",
      position,
      width: 250,
      height: 150,
      act: 1,
      order: beats.length
    };
    createBeat(projectId, beatData)
      .then(createdBeat => {
        setBeats([...beats, createdBeat]);
      })
      .catch(err => console.error('Failed to create beat:', err));
  };

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
      color: "#e5e7eb",
      order: lanes.length,
    };

    try {
      const createdLane = await createLane(projectId, newLaneData);
      setLanes(currentLanes => [...currentLanes, createdLane]);
    } catch (err) {
      console.error("Failed to create new lane", err);
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

    if (updates.timelinePosition !== undefined || updates.width !== undefined) {
      const item = outlineItems.find(i => i.id === itemId);
      if (item) {
        const updatedItem = { ...item, ...updates };
        const position = updatedItem.timelinePosition || 0;
        const width = updatedItem.width || 0;
        const startPage = getPageFromPosition(position);
        const endPage = getPageFromPosition(position + width);
        debouncedUpdateBeat(item.beatId, { startPage, endPage });
        setBeats(prev => prev.map(b =>
          b.id === item.beatId ? { ...b, startPage, endPage } : b
        ));
      }
    }
  };

  const handleDropOnTimeline = async (e: React.DragEvent, targetLaneId: string, targetItemId?: string) => {
    e.preventDefault();
    setHoveredLane(null);
    setDraggedLaneItem(null);
    const beatId = e.dataTransfer.getData("text/plain");
    const outlineItemId = e.dataTransfer.getData("application/x-outline-item-id");
    if (beatId) {
      const currentLaneItems = outlineItems.filter(item => item.laneId === targetLaneId);
      const beat = beats.find(b => b.id === beatId);
      const startPage = beat?.startPage || 1;
      const endPage = beat?.endPage || startPage;
      const timelinePosition = getPositionFromPage(startPage);
      const width = getWidthFromPages(startPage, endPage);
      const newItemData: Partial<OutlineItem> = {
        beatId, laneId: targetLaneId, order: currentLaneItems.length,
        timelinePosition, width,
      };
      try {
        const createdItem = await createOutlineItem(projectId, newItemData);
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
        const allItems = prevItems.filter(item => item.id !== outlineItemId);
        const targetLaneItems = allItems.filter(item => item.laneId === targetLaneId).sort((a, b) => a.order - b.order);
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

  const handleDeleteBeat = (id: string) => {
    deleteBeat(id).then(() => {
      setBeats(beats.filter(b => b.id !== id));
      setConnections(connections.filter(c => c.fromId !== id && c.toId !== id));
      setOutlineItems(outlineItems.filter(item => item.beatId !== id));
    }).catch(err => console.error("Failed to delete beat", err));
  };

  const handleFieldChange = (beatId: string, field: keyof Beat, value: Beat[keyof Beat]) => {
    setBeats(prevBeats => {
      const updatedBeats = prevBeats.map(beat => {
        if (beat.id !== beatId) return beat;

        const updatedBeat = { ...beat, [field]: value };

        // Ensure endPage is never less than startPage
        if (field === 'startPage' && updatedBeat.endPage && (value as number) > updatedBeat.endPage) {
          updatedBeat.endPage = value as number;
        } else if (field === 'endPage' && updatedBeat.startPage && (value as number) < updatedBeat.startPage) {
          updatedBeat.startPage = value as number;
        }

        return updatedBeat;
      });

      if (field === 'startPage' || field === 'endPage') {
        const updatedBeat = updatedBeats.find(b => b.id === beatId);
        if (updatedBeat) {
          const startPage = updatedBeat.startPage || 1;
          const endPage = updatedBeat.endPage || startPage;
          const timelinePosition = getPositionFromPage(startPage);
          const width = getWidthFromPages(startPage, endPage);

          const outlineItem = outlineItems.find(item => item.beatId === beatId);
          if (outlineItem) {
            setOutlineItems(prev => prev.map(item =>
              item.id === outlineItem.id
                ? { ...item, timelinePosition, width }
                : item
            ));
            debouncedUpdateOutlineItem(outlineItem.id, { timelinePosition, width });
          }
        }
      }

      return updatedBeats;
    });

    const validatedBeat = beats.find(b => b.id === beatId);
    if (validatedBeat) {
      const updateData: Partial<Beat> = { [field]: value };

      if (field === 'startPage' && validatedBeat.endPage && (value as number) > validatedBeat.endPage) {
        updateData.endPage = value as number;
      } else if (field === 'endPage' && validatedBeat.startPage && (value as number) < validatedBeat.startPage) {
        updateData.startPage = value as number;
      }

      debouncedUpdateBeat(beatId, updateData);
    }
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

  const handleBoardDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isBeatCard = target.closest('[data-beat-card]');

    if (!isBeatCard) {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = snapToGrid(e.clientX - rect.left + (boardRef.current?.scrollLeft || 0));
      const y = snapToGrid(e.clientY - rect.top + (boardRef.current?.scrollTop || 0));

      handleAddBeat({ x, y });
    }
  };

  const compressImage = async (file: File, maxWidth: number = 1024, maxHeight: number = 1024, quality: number = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = height * (maxWidth / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = width * (maxHeight / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to compress image'));
          }, 'image/jpeg', quality);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const uploadImage = async (file: File): Promise<string> => {
    const compressedBlob = await compressImage(file);

    const formData = new FormData();
    formData.append('image', compressedBlob, file.name);

    const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/beats/upload-image`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload image');
    }

    const { imageUrl } = await uploadResponse.json();
    return imageUrl;
  };

  const handleUploadImageForBeat = (beatId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const imageUrl = await uploadImage(file);
          setBeats(beats.map(b => b.id === beatId ? { ...b, imageUrl } : b));
          await updateBeat(beatId, { imageUrl });
        } catch (err) {
          console.error('Failed to upload image:', err);
        }
      }
    };
    input.click();
  };

  const handleImageDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (imageFile) {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = snapToGrid(e.clientX - rect.left + (boardRef.current?.scrollLeft || 0));
      const y = snapToGrid(e.clientY - rect.top + (boardRef.current?.scrollTop || 0));

      try {
        const imageUrl = await uploadImage(imageFile);
        const beatData: Partial<Beat> = {
          title: "New Image Beat",
          description: "",
          startPage: 1,
          endPage: 1,
          sceneNumbers: "Pg. 1",
          color: "#ffffff",
          imageUrl: imageUrl,
          position: { x, y },
          width: 250,
          height: 250,
          act: 1,
          order: beats.length
        };

        const createdBeat = await createBeat(projectId, beatData);
        setBeats([...beats, createdBeat]);
      } catch (err) {
        console.error('Failed to create beat with image:', err);
      }
    }
  };

  if (isLoading) return <PaneSpinner />
  if (error) return <div>{error}</div>;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-black" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/projects/editor?id=${projectId}`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to Editor</Button></Link>
            <Link href={`/projects/outline-editor?id=${projectId}`}>
              <Button variant="outline" size="sm">
                <LayoutGrid className="h-4 w-4 mr-2" />
                Go to Outline Editor
              </Button>
            </Link>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{project?.title || 'Beat Board'}</h1>
          </div>
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
          totalPages={TOTAL_PAGES} structure={structure}
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
        handleUploadImage={handleUploadImageForBeat}
        handleConnectionStart={handleConnectionStart}
        handleConnectionEnd={handleConnectionEnd}
        handleDeleteConnection={deleteConnection}
        tempConnection={tempConnection}
        isConnecting={isConnecting}
        connectionStart={connectionStart}
        onBoardDoubleClick={handleBoardDoubleClick}
        onImageDrop={handleImageDrop}
      />
    </div>
  )
}
