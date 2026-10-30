import type { NoteColourId } from "./notes"

/**
 * What a small drawing of a board draws (components/board/shapesPreview),
 * from its top left, in the board's own units: its notes in their colours,
 * its frames, its other shapes as outlines, its words as bars, and its
 * arrows. A built-in template's come from its skeleton
 * (components/board/templatePreview), a team's from the server's drawing of
 * it (lib/board/teamTemplates).
 */
export interface PreviewShapes {
  notes: { x: number; y: number; w: number; h: number; colour: NoteColourId }[]
  labels: { x: number; y: number; w: number; h: number }[]
  lines: { x1: number; y1: number; x2: number; y2: number }[]
  boxes: { x: number; y: number; w: number; h: number; round: boolean }[]
  frames: { x: number; y: number; w: number; h: number }[]
  width: number
  height: number
}
