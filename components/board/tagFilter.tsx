"use client"

// Filter by tag (miro-07 5), from the board's menu: pick tags, and every note
// without one of them fades back behind a veil while the notes with them stay
// as they are, until the filter is cleared. It is the picker's own view: no
// one else's board changes, and nothing is written to the drawing. "Select
// these" selects the notes kept, so the notes bar works on all of them at
// once (colour, tidy, cluster, vote). The rules are lib/board/tagFilter's.
//
// The veil is the board's own (components/board/boardVeil), which Find's
// dimming shares (V-271).

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useSceneElements } from "@/hooks/useSceneElements"
import { Button } from "@/components/ui/button"
import { Filter, X } from "@/lib/icons"
import { notesTagged } from "@/lib/board/tagFilter"
import { BoardVeil } from "@/components/board/boardVeil"
import type { SceneElement } from "@/components/board/boardOps"

/** The veil over the notes the filter leaves out, while there's a filter. */
export function TagVeil({ api, tags }: { api: ExcalidrawImperativeAPI; tags: readonly string[] }) {
  const all = useSceneElements<SceneElement>(api)
  const kept = React.useMemo(() => notesTagged(all, tags), [all, tags])
  return <BoardVeil api={api} kept={tags.length > 0 ? kept : null} data-tag-veil={kept.length} />
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
