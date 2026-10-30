"use client"

// Filter by tag (miro-07 5), from the board's menu: pick tags, and every note
// without one of them fades back behind a veil while the notes with them stay
// as they are, until the filter is cleared. It is the picker's own view: no
// one else's board changes, and nothing is written to the drawing. "Select
// these" selects the notes kept, so the notes bar works on all of them at
// once (colour, tidy, cluster, vote). The rules are lib/board/tagFilter's.
//
// The veil is an overlay over the canvas at z-2, as the tag chips are, drawn
// before them, so a faded note's chips fade with it (NoteTagChips' `kept`):
// under the live cursors (z-3), the vote dots and every panel, menu and bar.
// It takes no pointer: the board under it works as ever.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useBoardView } from "@/hooks/useBoardView"
import { useSceneElements } from "@/hooks/useSceneElements"
import { Button } from "@/components/ui/button"
import { Filter, X } from "@/lib/icons"
import { notesTagged, veilHoles } from "@/lib/board/tagFilter"
import type { SceneElement } from "@/components/board/boardOps"

/** The veil over the notes the filter leaves out, while there's a filter. */
export function TagVeil({ api, tags }: { api: ExcalidrawImperativeAPI; tags: readonly string[] }) {
  const all = useSceneElements<SceneElement>(api)
  const kept = React.useMemo(() => notesTagged(all, tags), [all, tags])
  // The view is followed only while there's a filter: a pan moves the holes with their notes.
  const view = useBoardView(api, tags.length > 0)
  // The mask's id, from React (unique on the page), kept to the characters a url() fragment takes as they are.
  const mask = `tag-veil-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  if (!view || tags.length === 0) return null
  return (
    <svg aria-hidden="true" data-tag-veil={kept.length} className="pointer-events-none absolute inset-0 z-[2]" width={view.width} height={view.height}>
      {/* White shows the veil and black keeps a hole clear: each kept note's own shape, so overlapping holes join. */}
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width={view.width} height={view.height}>
        <rect width={view.width} height={view.height} fill="white" />
        {veilHoles(view, kept).map((d, i) => (
          <path key={i} d={d} fill="black" />
        ))}
      </mask>
      <rect width={view.width} height={view.height} mask={`url(#${mask})`} className="fill-sheet/75" />
    </svg>
  )
}

/**
 * While a filter is on and its panel is closed, it says so where the panel was: the tags and how many notes they
 * keep, to open the panel again, and Clear.
 */
export function TagFilterPill({ api, tags, onOpen, onClear }: { api: ExcalidrawImperativeAPI; tags: readonly string[]; onOpen: () => void; onClear: () => void }) {
  const all = useSceneElements<SceneElement>(api)
  const kept = React.useMemo(() => notesTagged(all, tags), [all, tags])
  return (
    <div
      data-tag-filter-pill=""
      data-board-chrome=""
      className="content-float pointer-events-auto absolute right-3 top-16 z-30 flex h-10 max-sm:left-3 max-sm:right-auto max-w-[min(300px,calc(100%-1.5rem))] items-center gap-0.5 rounded-xl bg-pop p-1 shadow-e3"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Filtered by ${tags.join(", ")}: ${kept.length === 1 ? "1 note" : `${kept.length} notes`}. Change the filter`}
        className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        <Filter className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        <span className="truncate">{tags.join(", ")}</span>
        <span aria-hidden="true" className="tabular-nums text-ink-3">
          {kept.length}
        </span>
      </button>
      <Button variant="ghost" size="icon" aria-label="Clear the filter" title="Clear the filter" onClick={onClear}>
        <X />
      </Button>
    </div>
  )
}
