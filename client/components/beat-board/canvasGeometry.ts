import type { Beat } from "@/services/beat"
import type { Drawing } from "@/services/beat-board"

/** Room kept past the furthest thing on the board, so there is always somewhere
 *  to put the next beat or run the next stroke. Without it the canvas would end
 *  exactly at the last card and the board could never grow. */
export const CANVAS_HEADROOM = 400

export interface CanvasSize {
  width: number
  height: number
}

/**
 * How large the canvas surface must be to hold everything placed on it.
 *
 * Derived from the content, not measured from the scroll container: the surface
 * is *what makes* the container scroll, so sizing it from scrollWidth would
 * chase its own tail. Beats and shapes are the only things with canvas
 * coordinates, so they are the whole answer.
 */
export function canvasExtent(beats: Beat[], drawings: Drawing[]): CanvasSize {
  let right = 0
  let bottom = 0

  for (const beat of beats) {
    right = Math.max(right, beat.position.x + beat.width)
    bottom = Math.max(bottom, beat.position.y + beat.height)
  }

  for (const shape of drawings) {
    // A stroke straddles its path, so half the width hangs past the point.
    const half = shape.data.width / 2
    for (const point of shape.data.points) {
      right = Math.max(right, point.x + half)
      bottom = Math.max(bottom, point.y + half)
    }
  }

  return { width: right + CANVAS_HEADROOM, height: bottom + CANVAS_HEADROOM }
}

/**
 * Screen → canvas coordinates.
 *
 * The surface *is* the canvas: it holds every positioned child and it moves
 * with the scroll, so its rect already carries the scroll offset and
 * subtracting it is the entire conversion. Callers must not add
 * scrollLeft/scrollTop on top — that double-counts.
 *
 * This is one function because the call sites used to disagree: create and
 * image-drop added the scroll offset, drag and connect did not, so on a
 * scrolled board a dragged card jumped by the scroll distance.
 */
export function toCanvasPoint(
  surface: HTMLElement | null | undefined,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = surface?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return { x: clientX - rect.left, y: clientY - rect.top }
}
