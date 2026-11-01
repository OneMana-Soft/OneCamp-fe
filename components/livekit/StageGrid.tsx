"use client"

// The stage's grid and strip pieces (Stage Layout, A4, #54): a page of the
// grid at the tile size stageLayout chose, its pager, and the strip's "+N".
// The stage measures its own room for tiles (useContentBox) and hands it to
// stageLayout, which says what goes where.

import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react"
import { ChevronLeft, ChevronRight } from "@/lib/icons"
import { PAGER_H, STAGE_GAP, type Size, type StageKey, type StageLayout } from "@/lib/calls/stageLayout"

/** The pager's buttons: the dock's 44 px squares and corners (VideoControls). */
const PAGE_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-[10px] bg-[rgb(11_12_14/0.72)] text-[#EEEEF0] ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-[#1D1E22] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"

/** The content box of `ref`'s element, kept as it resizes: the stage's room for tiles. Zero until it is laid out. */
export function useContentBox(ref: RefObject<HTMLElement | null>): Size {
  const [box, setBox] = useState<Size>({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const css = getComputedStyle(el)
      const w = Math.round(el.clientWidth - parseFloat(css.paddingLeft || "0") - parseFloat(css.paddingRight || "0"))
      const h = Math.round(el.clientHeight - parseFloat(css.paddingTop || "0") - parseFloat(css.paddingBottom || "0"))
      setBox((was) => (was.w === Math.max(0, w) && was.h === Math.max(0, h) ? was : { w: Math.max(0, w), h: Math.max(0, h) }))
    }
    read()
    if (typeof ResizeObserver === "undefined") return
    const watch = new ResizeObserver(read)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return box
}

/**
 * A page of the grid: its tiles at the size the layout chose, in the middle of the stage, and the pager under them.
 * The tracks are at most that size and at least nothing (minmax(0, …)): a fixed size would be the stage's least width,
 * so a side column opening beside it would be pushed off the screen, and the stage, never narrower, never measured anew.
 */
export function StageGrid({ grid, cell, onPage }: { grid: NonNullable<StageLayout["grid"]>; cell: (key: StageKey) => ReactNode; onPage: (page: number) => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center" style={{ gap: STAGE_GAP }} data-stage-grid="">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, ${grid.tile.w}px))`, gridAutoRows: `minmax(0, ${grid.tile.h}px)`, gap: STAGE_GAP }}>
        {grid.keys.map((key) => (
          <div key={key} className="relative min-h-0 min-w-0">
            {cell(key)}
          </div>
        ))}
      </div>
      {grid.pages > 1 ? (
        <nav aria-label="Pages of people" className="flex shrink-0 items-center gap-3 text-ui-sm tabular-nums text-[#EEEEF0]" style={{ height: PAGER_H }} data-stage-pager="">
          <button type="button" aria-label="Previous page" className={PAGE_BUTTON} disabled={grid.page === 0} onClick={() => onPage(grid.page - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span aria-live="polite">
            Page {grid.page + 1} of {grid.pages}
          </span>
          <button type="button" aria-label="Next page" className={PAGE_BUTTON} disabled={grid.page === grid.pages - 1} onClick={() => onPage(grid.page + 1)}>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </nav>
      ) : null}
    </div>
  )
}

/** The strip's last place, at the strip's place size: how many more are in the call than it shows, which opens the grid of everyone. */
export function StageMore({ more, onShow, style }: { more: number; onShow: () => void; style?: CSSProperties }) {
  return (
    <button
      type="button"
      aria-label={`Show everyone (${more} more)`}
      className="grid shrink-0 place-items-center rounded-[14px] bg-[#16171A] text-ui-sm font-semibold tabular-nums text-[#EEEEF0] ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-[#1D1E22] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      style={style}
      onClick={onShow}
      data-stage-more=""
    >
      +{more}
    </button>
  )
}
