"use client"

// The sizes a frame starts at (miro-11: FRAME_PRESETS, 16:9, A4, phone…), as one list: the Frame tool's popover beside
// the tools on a computer, and the Frames panel's Add a frame (a sheet on a phone, which has no tool bar of ours).
// A pick lays the frame with addPresetFrame (boardOps), wherever the list is.

import * as React from "react"
import { FRAME_PRESETS } from "@/lib/board/frames"
import { cn } from "@/lib/utils/helpers/cn"

/** A frame's glyph: corners only, the way Excalidraw draws a frame's edge. */
export function FrameGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />
    </svg>
  )
}

/**
 * Each size as a row: its shape drawn small, its name and what it's for. Rows are touch-sized on a phone's sheet,
 * where the Frames panel's ref keeps the sheet cut across a row (components/ui/sheetPeek).
 */
export function FramePresetList({ onPick, sheet = false, ref }: { onPick: (presetId: string) => void; sheet?: boolean; ref?: React.Ref<HTMLUListElement> }) {
  return (
    <ul ref={ref} className="grid gap-px" aria-label="Frame sizes" data-frame-preset-list="">
      {FRAME_PRESETS.map((p) => {
        const w = 18
        const h = Math.round((p.height / p.width) * w)
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p.id)}
              data-frame-preset={p.id}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 text-left text-ui text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
                sheet ? "h-12" : "h-9",
              )}
            >
              <span aria-hidden="true" className="flex w-6 justify-center">
                <span className="block rounded-[2px] border border-line-3 bg-sunken" style={{ width: h > 22 ? Math.round((w * 22) / h) : w, height: Math.min(h, 22) }} />
              </span>
              <span className="flex-1">{p.label}</span>
              <span className="text-meta text-ink-3">{p.hint}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
