/**
 * A board's camera in this browser. Each board keeps where its person was
 * looking (as Excalidraw, Figma and Miro remember it), so a refresh doesn't
 * drop them on empty canvas far from the drawing, and a first visit frames
 * the drawing. Kept client-side only: a pan or a zoom writes nothing to the
 * server. The canvas restores and keeps it (BoardCanvas); a link whose object
 * is gone frames the drawing on a first visit, as a visit without the link
 * would (BoardWorkbench).
 */

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"

const VIEWPORT_STORAGE_PREFIX = "onecamp:board:viewport:"

export interface BoardViewport {
  scrollX: number
  scrollY: number
  zoom: number
}

/** The camera this browser kept for the board: null on a first visit here, or with storage off. */
export function loadBoardViewport(boardId: string): BoardViewport | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_STORAGE_PREFIX + boardId)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.scrollX === "number" && typeof v?.scrollY === "number" && typeof v?.zoom === "number") {
      return v as BoardViewport
    }
    return null
  } catch {
    return null
  }
}

export function saveBoardViewport(boardId: string, v: BoardViewport) {
  try {
    localStorage.setItem(VIEWPORT_STORAGE_PREFIX + boardId, JSON.stringify(v))
  } catch {
    // Private mode / quota: a camera that isn't kept is acceptable.
  }
}

/**
 * Frames the drawing a person sees, all of it and without animating: what a
 * first visit shows. False when nothing is drawn, and the camera stays.
 */
export function frameDrawing(api: Pick<ExcalidrawImperativeAPI, "getSceneElements" | "scrollToContent">): boolean {
  const els = api.getSceneElements()
  if (els.length === 0) return false
  api.scrollToContent(els, { fitToContent: true, animate: false })
  return true
}
