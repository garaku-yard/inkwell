import type React from "react";
import { ClipboardList } from "lucide-react";
import type { Beat, Connection } from "@/services/beat";
import type { Drawing } from "@/services/beat-board";
import { BeatCard } from "./BeatCard";
import { DrawingLayer } from "./DrawingLayer";
import { canvasExtent } from "./canvasGeometry";
import type { UseDrawingResult } from "./useDrawing";
import type { ConnectionSide } from "@/app/(private)/projects/beat-board/page";

interface BeatCanvasProps {
  /** The canvas surface, not the scroll container — everything in canvas
   *  coordinates is positioned against this. */
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  beats: Beat[];
  connections: Connection[];
  drawings: Drawing[];
  drawing: UseDrawingResult;
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

export function BeatCanvas({ surfaceRef, beats, connections, drawings, drawing, isLoading, ...props }: BeatCanvasProps) {

  const extent = canvasExtent(beats, drawings);

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
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="stroke-muted-foreground" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r="8" className="fill-card stroke-muted-foreground cursor-pointer hover:fill-destructive/20" strokeWidth="1"
          onClick={() => props.handleDeleteConnection(connection.id)} />
        <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 + 1} textAnchor="middle" fontSize="10" className="fill-gray-500 dark:fill-gray-400 pointer-events-none">×</text>
      </g>
    );
  };

  const ConnectionHandle = ({ beatId, side, position }: { beatId: string; side: ConnectionSide; position: React.CSSProperties; }) => (
    <div
      className="connection-handle absolute w-3 h-3 bg-primary border border-background rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-crosshair hover:bg-primary/80"
      style={position}
      onMouseDown={(e) => props.handleConnectionStart(e, beatId, side)}
      onMouseUp={() => props.isConnecting && props.handleConnectionEnd(beatId, side)}
    />
  );

  return (
    <div
      className="flex-1 relative overflow-auto cursor-default select-none bg-secondary"
      onDoubleClick={props.onBoardDoubleClick}
      onDrop={props.onImageDrop}
      onDragOver={(e) => {
        e.preventDefault();
      }}
    >
      {!isLoading && beats.length === 0 && drawings.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-muted-foreground p-8 rounded-lg border border-border bg-card/60 backdrop-blur-sm">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h2 className="mt-4 text-lg font-medium text-foreground">Your Beat Board is Empty</h2>
            <p className="mt-1 text-sm text-muted-foreground">Double-click to create a beat, drop an image, or pick a drawing tool to sketch.</p>
          </div>
        </div>
      )}
      {/* The canvas proper. The scrolling div above is only a window onto it:
          this element is sized to the whole board, so the layers inside cover
          the scrollable extent instead of stopping at the first screen. The dot
          grid lives here too — beats snap to it in canvas coordinates, so it
          has to scroll with them rather than stay pinned to the window. */}
      <div
        ref={surfaceRef}
        className="relative beat-board-background"
        style={{
          width: extent.width,
          height: extent.height,
          // Never smaller than the window, or a near-empty board would leave
          // bare container showing past the canvas.
          minWidth: "100%",
          minHeight: "100%",
          backgroundImage: `radial-gradient(circle, var(--grid-color, #e5e7eb) 1px, transparent 1px)`,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        }}
      >
        <svg className="absolute inset-0 w-full h-full text-muted-foreground" style={{ zIndex: 1 }}>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
            </marker>
          </defs>
          {connections.map(renderArrow)}
          {props.isConnecting && props.tempConnection && props.connectionStart && (() => {
            const startBeat = beats.find(b => b.id === props.connectionStart?.beatId);
            if (!startBeat) return null;
            const startPoint = getConnectionPoint(startBeat, props.connectionStart.side);
            return <line x1={startPoint.x} y1={startPoint.y} x2={props.tempConnection.x} y2={props.tempConnection.y} className="stroke-primary" strokeWidth="2" strokeDasharray="5,5" />;
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
        {/* Sits above the cards so a stroke can cross one, which is what marking
            up a board means. It only takes the pointer when a tool is actually
            selected, so with Select the cards behave exactly as they always did. */}
        <DrawingLayer
          drawings={drawings}
          draft={drawing.draft}
          tool={drawing.tool}
          onPointerDown={drawing.onPointerDown}
          onPointerMove={drawing.onPointerMove}
          onPointerUp={drawing.onPointerUp}
          eraseShape={drawing.eraseShape}
        />
      </div>
    </div>
  );
}
