"use client"
import type React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
import { ArrowLeft, Plus, MoreHorizontal, Trash2, Loader2, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  getBeatBoardForProject,
  createBeat,
  deleteBeat,
  updateBeat,
  createConnection,
  deleteConnection,
  type Beat,
  type Connection,
} from "@/services/beat"
const PRESET_COLORS = [
  "#fef3c7",
  "#fed7aa",
  "#dbeafe",
  "#dcfce7",
  "#f3e8ff",
  "#fce7f3",
  "#f3f4f6",
  "#fee2e2",
  "#ecfdf5",
  "#fef7cd",
  "#e0f2fe",
  "#f1f5f9",
]
const GRID_SIZE = 20
const MIN_CARD_WIDTH = 200
const MIN_CARD_HEIGHT = 150
export default function BeatBoardPage() {
  const [beats, setBeats] = useState<Beat[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const params = useParams()
  const projectId = params.id as string
  const [isAddingBeat, setIsAddingBeat] = useState(false)
  const [editingField, setEditingField] = useState<{ beatId: string; field: keyof Beat } | null>(null)
  const [draggedBeat, setDraggedBeat] = useState<string | null>(null)
  const [isResizing, setIsResizing] = useState<string | null>(null)
  const [resizeStartMousePos, setResizeStartMousePos] = useState({ x: 0, y: 0 })
  const [resizeStartBeatSize, setResizeStartBeatSize] = useState({ width: 0, height: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStart, setConnectionStart] = useState<{ beatId: string; side: string } | null>(null)
  const [tempConnection, setTempConnection] = useState<{ x: number; y: number } | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const [newBeat, setNewBeat] = useState({ title: "", description: "", sceneNumbers: "", color: "#fef3c7", act: 1 })
  useEffect(() => {
    if (!projectId) {
      return
    }
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const { beats: fetchedBeats, connections: fetchedConnections } = await getBeatBoardForProject(projectId)
        setBeats(fetchedBeats)
        setConnections(fetchedConnections)
      } catch (err) {
        setError("Failed to load beat board data.")
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [projectId])
  const debouncedUpdate = useDebouncedCallback((beatId: string, data: Partial<Beat>) => {
    updateBeat(beatId, data).catch((err) => console.error("Failed to save beat changes:", err))
  }, 800)
  const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE
  const handleAddBeat = () => {
    const beatData: Partial<Beat> = {
      title: newBeat.title || "Beat Title",
      description: newBeat.description || "Describe what happens in this beat...",
      sceneNumbers: newBeat.sceneNumbers || "Pg X-Y",
      color: newBeat.color,
      position: { x: snapToGrid(200), y: snapToGrid(200) },
      width: 288,
      height: 192,
      act: newBeat.act,
      order: beats.length + 1,
    }
    createBeat(projectId, beatData)
      .then((createdBeat) => {
        setBeats((prev) => [...prev, createdBeat])
        setNewBeat({ title: "", description: "", sceneNumbers: "", color: "#fef3c7", act: 1 })
        setIsAddingBeat(false)
      })
      .catch((err) => console.error("Failed to create beat:", err))
  }
  const handleDeleteBeat = (id: string) => {
    const originalBeats = [...beats]
    const originalConnections = [...connections]
    setBeats(beats.filter((b) => b.id !== id))
    setConnections(connections.filter((c) => c.fromId !== id && c.toId !== id))
    deleteBeat(id).catch((err) => {
      console.error("Failed to delete beat:", err)
      setBeats(originalBeats)
      setConnections(originalConnections)
    })
  }
  const handleConnectionEnd = (beatId: string, side: "top" | "right" | "bottom" | "left") => {
    if (connectionStart && connectionStart.beatId !== beatId) {
      const connData = {
        fromId: connectionStart.beatId,
        toId: beatId,
        fromSide: connectionStart.side,
        toSide: side,
      } as Partial<Connection>
      createConnection(projectId, connData)
        .then((newConnection) => setConnections((prev) => [...prev, newConnection]))
        .catch((err) => console.error("Failed to create connection:", err))
    }
    setIsConnecting(false)
    setConnectionStart(null)
    setTempConnection(null)
  }
  const handleDeleteConnection = (connectionId: string) => {
    const originalConnections = [...connections]
    setConnections(connections.filter((c) => c.id !== connectionId))
    deleteConnection(connectionId).catch((err) => {
      console.error("Failed to delete connection:", err)
      setConnections(originalConnections)
    })
  }
  const handleMouseDown = (e: React.MouseEvent, beatId: string) => {
    if (
      (e.target as HTMLElement).closest("input, textarea, button") ||
      (e.target as HTMLElement).classList.contains("connection-handle") ||
      (e.target as HTMLElement).classList.contains("resize-handle")
    )
      return
    const rect = e.currentTarget.getBoundingClientRect()
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setDraggedBeat(beatId)
  }
  const handleResizeMouseDown = (e: React.MouseEvent, beatId: string) => {
    e.stopPropagation()
    setIsResizing(beatId)
    setResizeStartMousePos({ x: e.clientX, y: e.clientY })
    const beat = beats.find((b) => b.id === beatId)
    if (beat) setResizeStartBeatSize({ width: beat.width, height: beat.height })
  }
  const handleConnectionStart = (e: React.MouseEvent, beatId: string, side: "top" | "right" | "bottom" | "left") => {
    e.stopPropagation()
    setIsConnecting(true)
    setConnectionStart({ beatId, side })
  }
  const handleDoubleClick = (beatId: string, field: keyof Beat) => setEditingField({ beatId, field })
  const handleFieldBlur = () => {
    if (editingField) {
      debouncedUpdate.flush()
    }
    setEditingField(null)
  }
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggedBeat && boardRef.current) {
        const boardRect = boardRef.current.getBoundingClientRect()
        const newX = snapToGrid(e.clientX - boardRect.left - dragOffset.x)
        const newY = snapToGrid(e.clientY - boardRect.top - dragOffset.y)
        setBeats((prev) =>
          prev.map((beat) =>
            beat.id === draggedBeat ? { ...beat, position: { x: Math.max(0, newX), y: Math.max(0, newY) } } : beat,
          ),
        )
      } else if (isResizing && boardRef.current) {
        const deltaX = e.clientX - resizeStartMousePos.x
        const deltaY = e.clientY - resizeStartMousePos.y
        setBeats((prev) =>
          prev.map((beat) => {
            if (beat.id === isResizing) {
              const newWidth = snapToGrid(Math.max(MIN_CARD_WIDTH, resizeStartBeatSize.width + deltaX))
              const newHeight = snapToGrid(Math.max(MIN_CARD_HEIGHT, resizeStartBeatSize.height + deltaY))
              return { ...beat, width: newWidth, height: newHeight }
            }
            return beat
          }),
        )
      }
      if (isConnecting && connectionStart && boardRef.current) {
        const boardRect = boardRef.current.getBoundingClientRect()
        setTempConnection({ x: e.clientX - boardRect.left, y: e.clientY - boardRect.top })
      }
    },
    [draggedBeat, dragOffset, isResizing, resizeStartMousePos, resizeStartBeatSize, isConnecting, connectionStart],
  )
  const handleMouseUp = () => {
    if (draggedBeat) {
      const beat = beats.find((b) => b.id === draggedBeat)
      if (beat) debouncedUpdate(beat.id, { position: beat.position })
    }
    if (isResizing) {
      const beat = beats.find((b) => b.id === isResizing)
      if (beat) debouncedUpdate(beat.id, { width: beat.width, height: beat.height })
    }
    setDraggedBeat(null)
    setIsResizing(null)
    if (isConnecting && !connectionStart) {
      setIsConnecting(false)
      setTempConnection(null)
    }
  }
  const handleFieldChange = (beatId: string, field: keyof Beat, value: any) => {
    setBeats(beats.map((b) => (b.id === beatId ? { ...b, [field]: value } : b)))
    debouncedUpdate(beatId, { [field]: value })
  }
  const handleChangeColor = (beatId: string, color: string) => {
    setBeats(beats.map((b) => (b.id === beatId ? { ...b, color } : b)))
    setColorPickerOpen(null)
    updateBeat(beatId, { color }).catch((err) => console.error("Failed to update color:", err))
  }
  const getConnectionPoint = (beat: Beat, side: "top" | "right" | "bottom" | "left") => {
    const { width, height, position } = beat
    switch (side) {
      case "top":
        return { x: position.x + width / 2, y: position.y }
      case "right":
        return { x: position.x + width, y: position.y + height / 2 }
      case "bottom":
        return { x: position.x + width / 2, y: position.y + height }
      case "left":
        return { x: position.x, y: position.y + height / 2 }
    }
  }
  const renderArrow = (connection: Connection) => {
    const fromBeat = beats.find((b) => b.id === connection.fromId)
    const toBeat = beats.find((b) => b.id === connection.toId)
    if (!fromBeat || !toBeat) return null
    const from = getConnectionPoint(fromBeat, connection.fromSide)
    const to = getConnectionPoint(toBeat, connection.toSide)
    return (
      <g key={connection.id} className="group">
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="#6b7280"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
        />
        <circle
          cx={(from.x + to.x) / 2}
          cy={(from.y + to.y) / 2}
          r="8"
          fill="white"
          stroke="#6b7280"
          strokeWidth="1"
          className="cursor-pointer hover:fill-red-100"
          onClick={() => handleDeleteConnection(connection.id)}
        />
        <text
          x={(from.x + to.x) / 2}
          y={(from.y + to.y) / 2 + 1}
          textAnchor="middle"
          fontSize="10"
          fill="#6b7280"
          className="pointer-events-none"
        >
          ×
        </text>
      </g>
    )
  }
  const ConnectionHandle = ({
    beatId,
    side,
    position,
  }: {
    beatId: string
    side: "top" | "right" | "bottom" | "left"
    position: React.CSSProperties
  }) => (
    <div
      className="connection-handle absolute w-3 h-3 bg-blue-500 border border-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-crosshair hover:bg-blue-600"
      style={position}
      onMouseDown={(e) => handleConnectionStart(e, beatId, side)}
      onMouseUp={() => isConnecting && handleConnectionEnd(beatId, side)}
    />
  )
  if (isLoading)
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  if (error)
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <div className="text-red-600 bg-red-100 border border-red-400 rounded p-4">{error}</div>
      </div>
    )
  return (
    <div className="h-screen flex flex-col bg-white">
      <div className="border-b border-gray-200 bg-white z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/projects/${projectId}/editor`}>
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Editor
              </Button>
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <h1 className="text-xl font-semibold text-gray-900">Beat Board</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsAddingBeat(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              New Beat
            </Button>
          </div>
        </div>
      </div>
      <div
        ref={boardRef}
        className="flex-1 relative overflow-auto cursor-default select-none"
        style={{
          backgroundImage: `radial-gradient(circle, #e5e7eb 1px, transparent 1px)`,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          backgroundColor: "#f9fafb",
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {!isLoading && beats.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-gray-500 p-8 rounded-lg bg-white/50 backdrop-blur-sm">
              <ClipboardList className="h-12 w-12 mx-auto text-gray-400" />
              <h2 className="mt-4 text-lg font-medium text-gray-800">Your Beat Board is Empty</h2>
              <p className="mt-1 text-sm text-gray-600">Click the "New Beat" button to get started.</p>
            </div>
          </div>
        )}
        <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }}>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
            </marker>
          </defs>
          {connections.map(renderArrow)}
          {isConnecting && connectionStart && tempConnection && (
            <line
              x1={
                getConnectionPoint(beats.find((b) => b.id === connectionStart.beatId)!, connectionStart.side as any).x
              }
              y1={
                getConnectionPoint(beats.find((b) => b.id === connectionStart.beatId)!, connectionStart.side as any).y
              }
              x2={tempConnection.x}
              y2={tempConnection.y}
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )}
        </svg>
        {beats.map((beat) => (
          <div
            key={beat.id}
            className={`absolute border rounded-lg p-4 shadow-md transition-all duration-100 hover:shadow-xl group cursor-grab ${draggedBeat === beat.id ? "shadow-2xl scale-105 cursor-grabbing" : ""
              }`}
            style={{
              left: beat.position.x,
              top: beat.position.y,
              width: beat.width,
              height: beat.height,
              backgroundColor: beat.color,
              borderColor: draggedBeat === beat.id ? "#3b82f6" : "#d1d5db",
              zIndex: draggedBeat === beat.id || isResizing === beat.id ? 10 : 2,
            }}
            onMouseDown={(e) => handleMouseDown(e, beat.id)}
          >
            <ConnectionHandle
              beatId={beat.id}
              side="top"
              position={{ top: "-6px", left: "50%", transform: "translateX(-50%)" }}
            />
            <ConnectionHandle
              beatId={beat.id}
              side="right"
              position={{ top: "50%", right: "-6px", transform: "translateY(-50%)" }}
            />
            <ConnectionHandle
              beatId={beat.id}
              side="bottom"
              position={{ bottom: "-6px", left: "50%", transform: "translateX(-50%)" }}
            />
            <ConnectionHandle
              beatId={beat.id}
              side="left"
              position={{ top: "50%", left: "-6px", transform: "translateY(-50%)" }}
            />
            <div
              className="resize-handle absolute -bottom-1 -right-1 w-3 h-3 bg-gray-600 border border-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-nwse-resize hover:bg-gray-800"
              onMouseDown={(e) => handleResizeMouseDown(e, beat.id)}
            />
            <div className="flex flex-col h-full">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0" onDoubleClick={() => handleDoubleClick(beat.id, "title")}>
                  {editingField?.beatId === beat.id && editingField?.field === "title" ? (
                    <Input
                      autoFocus
                      onBlur={handleFieldBlur}
                      value={beat.title}
                      onChange={(e) => handleFieldChange(beat.id, "title", e.target.value)}
                      className="h-auto p-0 text-sm font-semibold border-none bg-transparent focus-visible:ring-0"
                    />
                  ) : (
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">{beat.title}</h3>
                  )}
                  <div onDoubleClick={() => handleDoubleClick(beat.id, "sceneNumbers")}>
                    {editingField?.beatId === beat.id && editingField?.field === "sceneNumbers" ? (
                      <Input
                        autoFocus
                        onBlur={handleFieldBlur}
                        value={beat.sceneNumbers}
                        onChange={(e) => handleFieldChange(beat.id, "sceneNumbers", e.target.value)}
                        className="h-auto p-0 text-xs border-none bg-transparent focus-visible:ring-0 text-gray-500"
                      />
                    ) : (
                      <p className="text-xs text-gray-500 font-medium truncate">{beat.sceneNumbers}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Popover
                    open={colorPickerOpen === beat.id}
                    onOpenChange={(open) => setColorPickerOpen(open ? beat.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: beat.color }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="end">
                      <div className="grid grid-cols-6 gap-2 mt-2">
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            className="w-8 h-8 rounded border-2 hover:border-gray-400"
                            style={{
                              backgroundColor: color,
                              borderColor: beat.color === color ? "#3b82f6" : "#e5e7eb",
                            }}
                            onClick={() => handleChangeColor(beat.id, color)}
                          />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleDeleteBeat(beat.id)}
                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Beat
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex-1 overflow-auto" onDoubleClick={() => handleDoubleClick(beat.id, "description")}>
                {editingField?.beatId === beat.id && editingField?.field === "description" ? (
                  <Textarea
                    autoFocus
                    onBlur={handleFieldBlur}
                    value={beat.description}
                    onChange={(e) => handleFieldChange(beat.id, "description", e.target.value)}
                    className="text-sm w-full h-full bg-transparent border-none outline-none resize-none p-0 focus-visible:ring-0"
                  />
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{beat.description}</p>
                )}
              </div>
              <div className="absolute bottom-2 right-2">
                <span className="text-xs bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded-sm font-medium">
                  Act {beat.act}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={isAddingBeat} onOpenChange={setIsAddingBeat}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Beat</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="title" className="text-right">
                Title
              </Label>
              <Input
                id="title"
                value={newBeat.title}
                onChange={(e) => setNewBeat({ ...newBeat, title: e.target.value })}
                className="col-span-3"
                placeholder="A brief, active title"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Description
              </Label>
              <Textarea
                id="description"
                value={newBeat.description}
                onChange={(e) => setNewBeat({ ...newBeat, description: e.target.value })}
                className="col-span-3"
                placeholder="What happens in this beat?"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sceneNumbers" className="text-right">
                Pages
              </Label>
              <Input
                id="sceneNumbers"
                value={newBeat.sceneNumbers}
                onChange={(e) => setNewBeat({ ...newBeat, sceneNumbers: e.target.value })}
                className="col-span-3"
                placeholder="e.g., Pg. 1-5"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Act</Label>
              <Select
                value={newBeat.act.toString()}
                onValueChange={(value) => setNewBeat({ ...newBeat, act: Number.parseInt(value) })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Act One</SelectItem>
                  <SelectItem value="2">Act Two</SelectItem>
                  <SelectItem value="3">Act Three</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAddingBeat(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddBeat}>Add Beat</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
