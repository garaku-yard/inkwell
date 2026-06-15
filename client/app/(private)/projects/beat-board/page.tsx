"use client"

import type React from "react"
import { Suspense, useState, useRef, useMemo } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProjectNavMenu } from "@/components/editor/shared/ProjectNavMenu"
import { StoryLanes, type ScriptMarker } from "@/components/beat-board/StoryLanes";
import { BeatCanvas } from "@/components/beat-board/BeatCanvas";
import { PaneSpinner } from "@/components/shared/PaneSpinner";

import { createBeat, deleteBeat, updateBeat, deleteConnection, type Beat } from "@/services/beat"
import { type OutlineItem, updateOutlineItem } from "@/services/beat-board";
import { getProjectById, type FullProject } from "@/services/project"
import { useAuth } from "@/lib/AuthContext"
import { getCategoryStructure } from "@/lib/helpers/category-structure"
import { useProjectLoader } from "@/hooks/useProjectLoader"
import { useBeatBoardData } from "@/components/beat-board/useBeatBoardData"
import { useBeatImageUpload } from "@/components/beat-board/useBeatImageUpload"
import { useBeatDrag } from "@/components/beat-board/useBeatDrag"
import { useBeatResize } from "@/components/beat-board/useBeatResize"
import { useBeatConnections, type ConnectionSide } from "@/components/beat-board/useBeatConnections"
import { useTimelineDnD } from "@/components/beat-board/useTimelineDnD"
import { FullPageSpinner } from "@/components/shared/FullPageSpinner"

export type { ConnectionSide };

function BeatBoardPageContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const projectId = searchParams.get("id") ?? ""

  const {
    project,
    isLoading: projectLoading,
    error: projectError,
  } = useProjectLoader<FullProject>(projectId, user?.id, getProjectById)

  const {
    beats,
    setBeats,
    connections,
    setConnections,
    lanes,
    setLanes,
    outlineItems,
    setOutlineItems,
    isLoading: boardLoading,
    error: boardError,
  } = useBeatBoardData(project?.id)

  const isLoading = projectLoading || boardLoading
  const error = projectError ?? boardError

  const [editingField, setEditingField] = useState<{ beatId: string; field: keyof Beat } | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  // HTML5 drag-and-drop is distinct from the per-frame mouse drag the
  // useBeatDrag hook manages — this tracks which beat the user grabbed
  // for the timeline drop, while useBeatDrag tracks position changes
  // on the canvas.
  const [draggedBeat, setDraggedBeat] = useState<string | null>(null)

  const structure = useMemo(() => getCategoryStructure(project?.category), [project?.category]);

  const scriptMarkers = useMemo((): ScriptMarker[] =>
    structure.sections.map(s => ({ name: s.name, page: s.unit, color: s.color })),
  [structure]);

  const debouncedUpdateBeat = useDebouncedCallback((beatId: string, data: Partial<Beat>) => { updateBeat(beatId, data) }, 800);
  const debouncedUpdateOutlineItem = useDebouncedCallback((itemId: string, data: Partial<OutlineItem>) => { updateOutlineItem(itemId, data) }, 500);

  const snapToGrid = (value: number) => Math.round(value / 20) * 20;

  const drag = useBeatDrag({
    beats,
    setBeats,
    boardRef,
    snapToGrid,
    onCommit: (beatId, position) => debouncedUpdateBeat(beatId, { position }),
  })
  const resize = useBeatResize({
    beats,
    setBeats,
    snapToGrid,
    onCommit: (beatId, size) => debouncedUpdateBeat(beatId, size),
  })
  const connect = useBeatConnections({
    projectId,
    connections,
    setConnections,
    boardRef,
  })

  const onMouseMove = (e: React.MouseEvent) => {
    drag.onMouseMove(e)
    resize.onMouseMove(e)
    connect.onMouseMove(e)
  }
  const onMouseUp = () => {
    drag.onMouseUp()
    resize.onMouseUp()
    connect.onMouseUp()
  }

  const TOTAL_PAGES = structure.totalUnits;
  const getPageFromPosition = (position: number) => Math.max(1, Math.round((position / 100) * TOTAL_PAGES));
  const getPositionFromPage = (page: number) => ((page - 1) / TOTAL_PAGES) * 100;
  const getWidthFromPages = (startPage: number, endPage: number) => ((endPage - startPage + 1) / TOTAL_PAGES) * 100;

  const timeline = useTimelineDnD({
    projectId,
    beats,
    setBeats,
    outlineItems,
    setOutlineItems,
    lanes,
    setLanes,
    pageMath: { getPageFromPosition, getPositionFromPage, getWidthFromPages },
    debouncedUpdateBeat,
    debouncedUpdateOutlineItem,
  })

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

  const handleFieldBlur = () => {
    if (editingField) debouncedUpdateBeat.flush();
    setEditingField(null);
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

  const { uploadImageForBeat: handleUploadImageForBeat, onImageDrop: handleImageDrop } =
    useBeatImageUpload({ projectId, beats, setBeats, boardRef, snapToGrid })

  if (isLoading) return <PaneSpinner />
  if (error) return <div>{error}</div>;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-black" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Dashboard</Button></Link>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{project?.title || 'Beat Board'}</h1>
            {projectId && (
              <ProjectNavMenu
                projectId={projectId}
                category={project?.category}
                current="beat-board"
              />
            )}
          </div>
        </div>
        <StoryLanes
          onAddLane={timeline.handleAddLane}
          lanes={lanes}
          draggedLaneId={timeline.draggedLaneId}
          onUpdateLane={timeline.handleUpdateLane}
          onLaneDragStart={(_e, laneId) => timeline.setDraggedLaneId(laneId)}
          onLaneDrop={timeline.handleLaneDrop}
          onLaneDragEnd={() => timeline.setDraggedLaneId(null)}
          beats={beats} outlineItems={outlineItems} hoveredLane={timeline.hoveredLane}
          draggedLaneItem={timeline.draggedLaneItem} setHoveredLane={timeline.setHoveredLane}
          handleDropOnTimeline={timeline.handleDropOnTimeline}
          handleLaneDragStart={(_e, itemId) => timeline.setDraggedLaneItem(itemId)}
          setDraggedLaneItem={timeline.setDraggedLaneItem}
          onUpdateOutlineItem={timeline.handleUpdateOutlineItem} scriptMarkers={scriptMarkers}
          totalPages={TOTAL_PAGES} structure={structure}
        />
      </div>
      <BeatCanvas
        boardRef={boardRef} beats={beats} connections={connections} isLoading={isLoading}
        editingField={editingField} colorPickerOpen={colorPickerOpen} draggedBeat={draggedBeat}
        movingBeatId={drag.movingBeatId} isResizing={resize.isResizing}
        onMouseDownOnBeat={drag.onBeatMouseDown}
        onDragStartOnBeat={(_e, beatId) => setDraggedBeat(beatId)}
        onDragEndOnBeat={() => setDraggedBeat(null)}
        onResizeMouseDown={resize.onResizeMouseDown}
        handleFieldChange={handleFieldChange}
        handleDoubleClick={(beatId, field) => setEditingField({ beatId, field })}
        handleFieldBlur={handleFieldBlur}
        setColorPickerOpen={setColorPickerOpen}
        handleChangeColor={handleChangeColor}
        handleDeleteBeat={handleDeleteBeat}
        handleUploadImage={handleUploadImageForBeat}
        handleConnectionStart={connect.onConnectionStart}
        handleConnectionEnd={connect.onConnectionEnd}
        handleDeleteConnection={deleteConnection}
        tempConnection={connect.tempConnection}
        isConnecting={connect.isConnecting}
        connectionStart={connect.connectionStart}
        onBoardDoubleClick={handleBoardDoubleClick}
        onImageDrop={handleImageDrop}
      />
    </div>
  )
}

export default function BeatBoardPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <BeatBoardPageContent />
    </Suspense>
  )
}
