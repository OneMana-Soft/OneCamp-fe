"use client"

// A veil over the board: everything on it fades back behind the veil but the
// elements it keeps. It is the viewer's own view: no one else's board
// changes, and nothing is written to the drawing. The tag filter keeps the
// notes with its tags (components/board/tagFilter); Find keeps its matches
// while it dims the rest (components/board/findPanel, V-271). The holes are
// lib/board/veil's.
//
// The veil is an overlay over the canvas at z-2, as the tag chips are, drawn
// before them, so a faded note's chips fade with it (NoteTagChips' `faded`):
// under the live cursors (z-3), the vote dots and every panel, menu and bar.
// It takes no pointer: the board under it works as ever. It never moves, so
// there is nothing to reduce for reduced motion.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useBoardView } from "@/hooks/useBoardView"
import { veilHoles, VEIL_MARGIN, type VeilElement } from "@/lib/board/veil"

type DataAttributes = { [name: `data-${string}`]: string | number | undefined }

/** The veil over every element but `kept`, while there are some to keep (null: no veil). */
export function BoardVeil({
  api,
  kept,
  above,
  ...data
}: {
  api: ExcalidrawImperativeAPI
  kept: readonly VeilElement[] | null
  /** What of an element shows above its box on the page, whatever the zoom (a frame's name): its hole covers that too. */
  above?: (el: VeilElement) => number
} & DataAttributes) {
  // The view is followed only while there's a veil: a pan moves the holes with what they keep.
  const view = useBoardView(api, kept != null)
  // The mask's id, from React (unique on the page), kept to the characters a url() fragment takes as they are.
  const mask = `board-veil-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  if (!view || kept == null) return null
  return (
    <svg aria-hidden="true" {...data} className="pointer-events-none absolute inset-0 z-[2]" width={view.width} height={view.height}>
      {/* White shows the veil and black keeps a hole clear: each kept element's own shape, so overlapping holes join. */}
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width={view.width} height={view.height}>
        <rect width={view.width} height={view.height} fill="white" />
        {veilHoles(view, kept, VEIL_MARGIN, above).map((d, i) => (
          <path key={i} d={d} fill="black" />
        ))}
      </mask>
      <rect width={view.width} height={view.height} mask={`url(#${mask})`} className="fill-sheet/75" />
    </svg>
  )
}
