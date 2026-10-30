"use client"

/**
 * The canvas's place while it loads (the live connection, then the drawing
 * library): the canvas's own ground (--board-ground, the colour Excalidraw
 * draws in each theme), edge to edge, so the board arrives in the place and
 * the colour it was held in, and what is happening, in words. The sheet was
 * a step off in dark (#131416 held, #121212 drawn).
 * Each step showed a spinner in the middle of an empty page; then an inset,
 * rounded card that gave way to a full-bleed canvas of another colour.
 */
export function CanvasPending() {
  return (
    <div aria-busy="true" className="relative h-full w-full bg-board-ground" data-canvas-pending="">
      <p role="status" className="sr-only">Opening the board…</p>
    </div>
  )
}

