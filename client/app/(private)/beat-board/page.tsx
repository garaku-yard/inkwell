"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import { ArrowLeft, Plus, MoreHorizontal, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface Beat {
  id: string
  title: string
  description: string
  sceneNumbers: string
  color: string
  position: { x: number; y: number }
  width: number
  height: number
  act: number
  order: number
}

interface Connection {
  id: string
  fromId: string
  toId: string
  fromSide: "top" | "right" | "bottom" | "left"
  toSide: "top" | "right" | "bottom" | "left"
}

const PRESET_COLORS = [
  "#fef3c7", // yellow
  "#fed7aa", // orange
  "#dbeafe", // blue
  "#dcfce7", // green
  "#f3e8ff", // purple
  "#fce7f3", // pink
  "#f3f4f6", // gray
  "#fee2e2", // red
  "#ecfdf5", // emerald
  "#fef7cd", // amber
  "#e0f2fe", // sky
  "#f1f5f9", // slate
]

const GRID_SIZE = 20
const MIN_CARD_WIDTH = 200
const MIN_CARD_HEIGHT = 150

export default function BeatBoardPage() {
  const [beats, setBeats] = useState<Beat[]>([
    {
      id: "1",
      title: "Set up Gold Key",
      description: "Tangle questions Uncle about a mysterious key.",
      sceneNumbers: "Pg 1-14",
      color: "#fed7aa",
      position: { x: 100, y: 150 },
      width: 288,
      height: 192,
      act: 1,
      order: 1,
    },
    {
      id: "2",
      title: "Maids threaten...",
      description: "Flashback: Tangle discovers the maids stacking off, and they threaten to kill her.",
      sceneNumbers: "Pg 1-2%",
      color: "#fef3c7",
      position: { x: 400, y: 150 },
      width: 288,
      height: 192,
      act: 1,
      order: 2,
    },
    {
      id: "3",
      title: "Tangle's desire...",
      description: "Tangle keeps quiet about the maids, but presses on about the key.",
      sceneNumbers: "Pg 2% - 3",
      color: "#fef3c7",
      position: { x: 700, y: 150 },
      width: 288,
      height: 192,
      act: 1,
      order: 3,
    },
    {
      id: "4",
      title: "Uncle leaves",
      description: "Tangle sees him off. Uncle warns her to be careful.",
      sceneNumbers: "Pg 3 - 4",
      color: "#fed7aa",
      position: { x: 100, y: 350 },
      width: 288,
      height: 192,
      act: 1,
      order: 4,
    },
    {
      id: "5",
      title: "Rivals clashing",
      description: "Argue about who should hold the key.",
      sceneNumbers: "Pg 7 - 7%",
      color: "#dbeafe",
      position: { x: 400, y: 550 },
      width: 288,
      height: 192,
      act: 2,
      order: 5,
    },
  ])

  const [connections, setConnections] = useState<Connection[]>([
    { id: "c1", fromId: "1", toId: "2", fromSide: "right", toSide: "left" },
    { id: "c2", fromId: "2", toId: "3", fromSide: "right", toSide: "left" },
    { id: "c3", fromId: "3", toId: "4", fromSide: "bottom", toSide: "top" },
  ])

  const [isAddingBeat, setIsAddingBeat] = useState(false)
  const [editingField, setEditingField] = useState<{ beatId: string; field: string } | null>(null)
  const [draggedBeat, setDraggedBeat] = useState<string | null>(null)
  const [isResizing, setIsResizing] = useState<string | null>(null) // Stores beatId being resized
  const [resizeStartMousePos, setResizeStartMousePos] = useState({ x: 0, y: 0 })
  const [resizeStartBeatSize, setResizeStartBeatSize] = useState({ width: 0, height: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStart, setConnectionStart] = useState<{ beatId: string; side: string } | null>(null)
  const [tempConnection, setTempConnection] = useState<{ x: number; y: number } | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const [newBeat, setNewBeat] = useState({
    title: "",
    description: "",
    sceneNumbers: "",
    color: "#fef3c7",
    act: 1,
  })

  const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE

  const handleAddBeat = () => {
    const beat: Beat = {
      id: Date.now().toString(),
      title: newBeat.title || "Beat Title",
      description: newBeat.description || "Describe what happens in this beat...",
      sceneNumbers: newBeat.sceneNumbers || "Pg X-Y",
      color: newBeat.color,
      position: { x: snapToGrid(200), y: snapToGrid(200) },
      width: 288, // Default width
      height: 192, // Default height
      act: newBeat.act,
      order: beats.length + 1,
    }
    setBeats([...beats, beat])
    setNewBeat({ title: "", description: "", sceneNumbers: "", color: "#fef3c7", act: 1 })
    setIsAddingBeat(false)
  }

  const handleMouseDown = (e: React.MouseEvent, beatId: string) => {
    // Don't start dragging if clicking on editable text or connection handles or resize handle
    if (
      (e.target as HTMLElement).contentEditable === "true" ||
      (e.target as HTMLElement).classList.contains("connection-handle") ||
      (e.target as HTMLElement).classList.contains("resize-handle")
    ) {
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
    setDraggedBeat(beatId)
  }

  const handleResizeMouseDown = (e: React.MouseEvent, beatId: string) => {
    e.stopPropagation() // Prevent dragging the card
    setIsResizing(beatId)
    setResizeStartMousePos({ x: e.clientX, y: e.clientY })
    const beat = beats.find((b) => b.id === beatId)
    if (beat) {
      setResizeStartBeatSize({ width: beat.width, height: beat.height })
    }
  }

  const handleConnectionStart = (e: React.MouseEvent, beatId: string, side: "top" | "right" | "bottom" | "left") => {
    e.stopPropagation()
    setIsConnecting(true)
    setConnectionStart({ beatId, side })
  }

  const handleConnectionEnd = (beatId: string, side: "top" | "right" | "bottom" | "left") => {
    if (connectionStart && connectionStart.beatId !== beatId) {
      const newConnection: Connection = {
        id: Date.now().toString(),
        fromId: connectionStart.beatId,
        toId: beatId,
        fromSide: connectionStart.side as "top" | "right" | "bottom" | "left",
        toSide: side,
      }
      setConnections([...connections, newConnection])
    }
    setIsConnecting(false)
    setConnectionStart(null)
    setTempConnection(null)
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggedBeat && boardRef.current) {
        const boardRect = boardRef.current.getBoundingClientRect()
        const newX = snapToGrid(e.clientX - boardRect.left - dragOffset.x)
        const newY = snapToGrid(e.clientY - boardRect.top - dragOffset.y)

        setBeats((prevBeats) =>
          prevBeats.map((beat) =>
            beat.id === draggedBeat ? { ...beat, position: { x: Math.max(0, newX), y: Math.max(0, newY) } } : beat,
          ),
        )
      } else if (isResizing && boardRef.current) {
        const deltaX = e.clientX - resizeStartMousePos.x
        const deltaY = e.clientY - resizeStartMousePos.y

        setBeats((prevBeats) =>
          prevBeats.map((beat) => {
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
        setTempConnection({
          x: e.clientX - boardRect.left,
          y: e.clientY - boardRect.top,
        })
      }
    },
    [draggedBeat, dragOffset, isResizing, resizeStartMousePos, resizeStartBeatSize, isConnecting, connectionStart],
  )

  const handleMouseUp = () => {
    setDraggedBeat(null)
    setIsResizing(null)
    if (isConnecting && !connectionStart) {
      setIsConnecting(false)
      setTempConnection(null)
    }
  }

  const handleDoubleClick = (beatId: string, field: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingField({ beatId, field })
  }

  const handleFieldChange = (beatId: string, field: string, value: string) => {
    setBeats(beats.map((b) => (b.id === beatId ? { ...b, [field]: value } : b)))
  }

  const handleFieldBlur = () => {
    setEditingField(null)
  }

  const handleDeleteBeat = (id: string) => {
    setBeats(beats.filter((b) => b.id !== id))
    setConnections(connections.filter((c) => c.fromId !== id && c.toId !== id))
  }

  const handleChangeColor = (beatId: string, color: string) => {
    setBeats(beats.map((b) => (b.id === beatId ? { ...b, color } : b)))
    setColorPickerOpen(null)
  }

  const handleDeleteConnection = (connectionId: string) => {
    setConnections(connections.filter((c) => c.id !== connectionId))
  }

  const getConnectionPoint = (beat: Beat, side: "top" | "right" | "bottom" | "left") => {
    const cardWidth = beat.width
    const cardHeight = beat.height

    switch (side) {
      case "top":
        return { x: beat.position.x + cardWidth / 2, y: beat.position.y }
      case "right":
        return { x: beat.position.x + cardWidth, y: beat.position.y + cardHeight / 2 }
      case "bottom":
        return { x: beat.position.x + cardWidth / 2, y: beat.position.y + cardHeight }
      case "left":
        return { x: beat.position.x, y: beat.position.y + cardHeight / 2 }
    }
  }

  const renderArrow = (connection: Connection) => {
    const fromBeat = beats.find((b) => b.id === connection.fromId)
    const toBeat = beats.find((b) => b.id === connection.toId)

    if (!fromBeat || !toBeat) return null

    const from = getConnectionPoint(fromBeat, connection.fromSide)
    const to = getConnectionPoint(toBeat, connection.toSide)

    return (
      <g key={connection.id}>
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
    position: { top?: string; right?: string; bottom?: string; left?: string }
  }) => (
    <div
      className="connection-handle absolute w-4 h-4 bg-blue-500 border-2 border-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-crosshair hover:bg-blue-600 flex items-center justify-center"
      style={position}
      onMouseDown={(e) => handleConnectionStart(e, beatId, side)}
      onMouseUp={() => isConnecting && handleConnectionEnd(beatId, side)}
    >
      <Plus className="w-2 h-2 text-white" />
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
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

      {/* Board */}
      <div
        ref={boardRef}
        className="flex-1 relative overflow-auto cursor-default select-none"
        style={{
          backgroundImage: `radial-gradient(circle, #d1d5db 1px, transparent 1px)`,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          backgroundColor: "#f9fafb",
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* SVG for connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
            </marker>
          </defs>
          {connections.map(renderArrow)}
          {isConnecting && connectionStart && tempConnection && (
            <line
              x1={
                getConnectionPoint(
                  beats.find((b) => b.id === connectionStart.beatId)!,
                  connectionStart.side as "top" | "right" | "bottom" | "left",
                ).x
              }
              y1={
                getConnectionPoint(
                  beats.find((b) => b.id === connectionStart.beatId)!,
                  connectionStart.side as "top" | "right" | "bottom" | "left",
                ).y
              }
              x2={tempConnection.x}
              y2={tempConnection.y}
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )}
        </svg>

        {/* Beat Cards */}
        {beats.map((beat) => (
          <div
            key={beat.id}
            className={`absolute border-2 border-gray-300 rounded-lg p-4 transition-all duration-200 hover:shadow-lg group cursor-move
              ${draggedBeat === beat.id ? "shadow-xl scale-105" : ""}`}
            style={{
              left: beat.position.x,
              top: beat.position.y,
              width: beat.width,
              height: beat.height,
              backgroundColor: beat.color,
              zIndex: draggedBeat === beat.id || isResizing === beat.id ? 10 : 2,
            }}
            onMouseDown={(e) => handleMouseDown(e, beat.id)}
          >
            {/* Connection Handles */}
            <ConnectionHandle
              beatId={beat.id}
              side="top"
              position={{ top: "-8px", left: "50%", transform: "translateX(-50%)" }}
            />
            <ConnectionHandle
              beatId={beat.id}
              side="right"
              position={{ top: "50%", right: "-8px", transform: "translateY(-50%)" }}
            />
            <ConnectionHandle
              beatId={beat.id}
              side="bottom"
              position={{ bottom: "-8px", left: "50%", transform: "translateX(-50%)" }}
            />
            <ConnectionHandle
              beatId={beat.id}
              side="left"
              position={{ top: "50%", left: "-8px", transform: "translateY(-50%)" }}
            />

            {/* Resize Handle */}
            <div
              className="resize-handle absolute -bottom-2 -right-2 w-4 h-4 bg-gray-700 border-2 border-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-nwse-resize hover:bg-gray-800"
              onMouseDown={(e) => handleResizeMouseDown(e, beat.id)}
            />

            {/* Card Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                {/* Title - Editable */}
                {editingField?.beatId === beat.id && editingField?.field === "title" ? (
                  <input
                    type="text"
                    value={beat.title}
                    onChange={(e) => handleFieldChange(beat.id, "title", e.target.value)}
                    onBlur={handleFieldBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFieldBlur()
                    }}
                    className="font-semibold text-gray-900 text-sm leading-tight mb-1 w-full bg-transparent border-none outline-none resize-none"
                    autoFocus
                  />
                ) : (
                  <h3
                    className={`font-semibold text-gray-900 text-sm leading-tight mb-1 cursor-text ${beat.title === "Beat Title" ? "text-gray-400 italic" : ""
                      }`}
                    onDoubleClick={(e) => handleDoubleClick(beat.id, "title", e)}
                  >
                    {beat.title}
                  </h3>
                )}

                {/* Scene Numbers - Editable */}
                {editingField?.beatId === beat.id && editingField?.field === "sceneNumbers" ? (
                  <input
                    type="text"
                    value={beat.sceneNumbers}
                    onChange={(e) => handleFieldChange(beat.id, "sceneNumbers", e.target.value)}
                    onBlur={handleFieldBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFieldBlur()
                    }}
                    className="text-xs text-gray-500 font-medium w-full bg-transparent border-none outline-none"
                    autoFocus
                  />
                ) : (
                  <div
                    className={`text-xs text-gray-500 font-medium cursor-text ${beat.sceneNumbers === "Pg X-Y" ? "text-gray-400 italic" : ""
                      }`}
                    onDoubleClick={(e) => handleDoubleClick(beat.id, "sceneNumbers", e)}
                  >
                    {beat.sceneNumbers}
                  </div>
                )}
              </div>

              <div className="flex gap-1">
                {/* Color Picker */}
                <Popover
                  open={colorPickerOpen === beat.id}
                  onOpenChange={(open) => setColorPickerOpen(open ? beat.id : null)}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        setColorPickerOpen(colorPickerOpen === beat.id ? null : beat.id)
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded border-2 border-gray-300"
                        style={{ backgroundColor: beat.color }}
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="end">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium">Preset Colors</Label>
                        <div className="grid grid-cols-6 gap-2 mt-2">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              className="w-8 h-8 rounded border-2 border-gray-200 hover:border-gray-400 transition-colors"
                              style={{ backgroundColor: color }}
                              onClick={() => handleChangeColor(beat.id, color)}
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label htmlFor={`custom-color-${beat.id}`} className="text-sm font-medium">
                          Custom Color
                        </Label>
                        <input
                          id={`custom-color-${beat.id}`}
                          type="color"
                          value={beat.color}
                          onChange={(e) => handleChangeColor(beat.id, e.target.value)}
                          className="w-full h-10 mt-1 rounded border border-gray-300 cursor-pointer"
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* More Options */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleDeleteBeat(beat.id)} className="text-red-600">
                      <Trash2 className="h-3 w-3 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Description - Editable */}
            {editingField?.beatId === beat.id && editingField?.field === "description" ? (
              <textarea
                value={beat.description}
                onChange={(e) => handleFieldChange(beat.id, "description", e.target.value)}
                onBlur={handleFieldBlur}
                className="text-sm text-gray-700 leading-relaxed w-full h-full bg-transparent border-none outline-none resize-none"
                autoFocus
                style={{ height: `calc(${beat.height}px - 100px)` }} // Adjust height dynamically
              />
            ) : (
              <p
                className={`text-sm text-gray-700 leading-relaxed cursor-text overflow-hidden ${beat.description === "Describe what happens in this beat..." ? "text-gray-400 italic" : ""
                  }`}
                onDoubleClick={(e) => handleDoubleClick(beat.id, "description", e)}
                style={{ height: `calc(${beat.height}px - 100px)` }} // Adjust height dynamically
              >
                {beat.description}
              </p>
            )}

            {/* Act Badge */}
            <div className="absolute bottom-2 right-2">
              <span className="text-xs bg-gray-800 text-white px-2 py-1 rounded">Act {beat.act}</span>
            </div>
          </div>
        ))}

        {/* Instructions */}
        {isConnecting && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-100 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800 z-20">
            Drag to another card's + handle to connect
          </div>
        )}
      </div>

      {/* Add Beat Dialog */}
      <Dialog open={isAddingBeat} onOpenChange={setIsAddingBeat}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Beat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                value={newBeat.title}
                onChange={(e) => setNewBeat({ ...newBeat, title: e.target.value })}
                placeholder="Leave empty for placeholder"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newBeat.description}
                onChange={(e) => setNewBeat({ ...newBeat, description: e.target.value })}
                placeholder="Leave empty for placeholder"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="sceneNumbers">Scene Numbers (optional)</Label>
              <Input
                id="sceneNumbers"
                value={newBeat.sceneNumbers}
                onChange={(e) => setNewBeat({ ...newBeat, sceneNumbers: e.target.value })}
                placeholder="Leave empty for placeholder"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="act">Act</Label>
                <Select
                  value={newBeat.act.toString()}
                  onValueChange={(value) => setNewBeat({ ...newBeat, act: Number.parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Act One</SelectItem>
                    <SelectItem value="2">Act Two</SelectItem>
                    <SelectItem value="3">Act Three</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="color">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newBeat.color}
                    onChange={(e) => setNewBeat({ ...newBeat, color: e.target.value })}
                    className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <span className="text-sm text-gray-600">Pick color</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddingBeat(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddBeat}>Add Beat</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
