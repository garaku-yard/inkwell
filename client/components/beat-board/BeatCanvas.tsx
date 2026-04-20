import type React from "react";
import { ClipboardList } from "lucide-react";
import type { Beat, Connection } from "@/services/beat";
import { BeatCard } from "./BeatCard";
import type { ConnectionSide } from "@/app/(private)/projects/beat-board/page";

interface BeatCanvasProps {
  boardRef: React.RefObject<HTMLDivElement | null>;
  beats: Beat[];
  connections: Connection[];
  isLoading: boolean;
  editingField: { beatId: string; field: keyof Beat } | null;
  colorPickerOpen: string | null;
  draggedBeat: string | null;
  movingBeatId: string | null;
  isResizing: string | null;
  onMouseDownOnBeat: (e: React.MouseEvent, beatId: string) => void;
  onDragStartOnBeat: (e: React.DragEvent, beatId: string) => void;
  onDragEndOnBeat: () => void;
  onResizeMouseDown: (e: React.MouseEvent, beatId: string) => void;
  handleFieldChange: (beatId: string, field: keyof Beat, value: Beat[keyof Beat]) => void;
  handleDoubleClick: (beatId: string, field: keyof Beat) => void;
  handleFieldBlur: () => void;
  setColorPickerOpen: (id: string | null) => void;
  handleChangeColor: (beatId: string, color: string) => void;
  handleDeleteBeat: (beatId: string) => void;
  handleUploadImage: (beatId: string) => void;
  handleConnectionStart: (e: React.MouseEvent, beatId: string, side: ConnectionSide) => void;
  handleConnectionEnd: (beatId: string, side: ConnectionSide) => void;
  handleDeleteConnection: (connectionId: string) => void;
  tempConnection: { x: number; y: number } | null;
  isConnecting: boolean;
  connectionStart: { beatId: string; side: ConnectionSide } | null;
  onBoardDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onImageDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}

const GRID_SIZE = 20;

export function BeatCanvas({ boardRef, beats, connections, isLoading, ...props }: BeatCanvasProps) {

  const getConnectionPoint = (beat: Beat, side: "top" | "right" | "bottom" | "left") => {
    const { width, height, position } = beat;
    switch (side) {
      case "top": return { x: position.x + width / 2, y: position.y };
      case "right": return { x: position.x + width, y: position.y + height / 2 };
      case "bottom": return { x: position.x + width / 2, y: position.y + height };
      case "left": return { x: position.x, y: position.y + height / 2 };
    }
  };

  const renderArrow = (connection: Connection) => {
    const fromBeat = beats.find((b) => b.id === connection.fromId);
    const toBeat = beats.find((b) => b.id === connection.toId);
    if (!fromBeat || !toBeat) return null;
    const from = getConnectionPoint(fromBeat, connection.fromSide);
    const to = getConnectionPoint(toBeat, connection.toSide);
    return (
      <g key={connection.id} className="group">
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="stroke-gray-500 dark:stroke-gray-400" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r="8" className="fill-white dark:fill-gray-800 stroke-gray-500 dark:stroke-gray-400 cursor-pointer hover:fill-red-100 dark:hover:fill-red-900" strokeWidth="1"
          onClick={() => props.handleDeleteConnection(connection.id)} />
        <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 + 1} textAnchor="middle" fontSize="10" className="fill-gray-500 dark:fill-gray-400 pointer-events-none">×</text>
      </g>
    );
  };

  const ConnectionHandle = ({ beatId, side, position }: { beatId: string; side: ConnectionSide; position: React.CSSProperties; }) => (
    <div
      className="connection-handle absolute w-3 h-3 bg-blue-500 border border-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-crosshair hover:bg-blue-600"
      style={position}
      onMouseDown={(e) => props.handleConnectionStart(e, beatId, side)}
      onMouseUp={() => props.isConnecting && props.handleConnectionEnd(beatId, side)}
    />
  );

  return (
    <div
      ref={boardRef}
      className="flex-1 relative overflow-auto cursor-default select-none beat-board-background bg-gray-50 dark:bg-black"
      style={{
        backgroundImage: `radial-gradient(circle, var(--grid-color, #e5e7eb) 1px, transparent 1px)`,
        backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
      }}
      onDoubleClick={props.onBoardDoubleClick}
      onDrop={props.onImageDrop}
      onDragOver={(e) => {
        e.preventDefault();
      }}
    >
      {!isLoading && beats.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-gray-500 dark:text-gray-400 p-8 rounded-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
            <ClipboardList className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500" />
            <h2 className="mt-4 text-lg font-medium text-gray-800 dark:text-gray-200">Your Beat Board is Empty</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Double-click to create a beat or drop an image to create a visual beat.</p>
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
        {props.isConnecting && props.tempConnection && props.connectionStart && (() => {
          const startBeat = beats.find(b => b.id === props.connectionStart?.beatId);
          if (!startBeat) return null;
          const startPoint = getConnectionPoint(startBeat, props.connectionStart.side);
          return <line x1={startPoint.x} y1={startPoint.y} x2={props.tempConnection.x} y2={props.tempConnection.y} stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" />;
        })()}
      </svg>
      {beats.map((beat) => (
        <BeatCard key={beat.id} beat={beat} {...props}>
          <ConnectionHandle beatId={beat.id} side="top" position={{ top: "-6px", left: "50%", transform: "translateX(-50%)" }} />
          <ConnectionHandle beatId={beat.id} side="right" position={{ top: "50%", right: "-6px", transform: "translateY(-50%)" }} />
          <ConnectionHandle beatId={beat.id} side="bottom" position={{ bottom: "-6px", left: "50%", transform: "translateX(-50%)" }} />
          <ConnectionHandle beatId={beat.id} side="left" position={{ top: "50%", left: "-6px", transform: "translateY(-50%)" }} />
        </BeatCard>
      ))}
    </div>
  );
}
