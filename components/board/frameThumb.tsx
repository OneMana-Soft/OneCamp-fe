"use client"

// A frame drawn small: its shape, and what it holds, its notes in their camp tints and anything else as a quiet box.
// One drawing for the Frames panel's rows (framesPanel) and a board's slides as a grid (boardSlides, miro-28), so a
// slide's tile shows what the panel's row shows.

import { isStickyNote, noteColourOf } from "@/lib/board/notes"
import { noteTint } from "@/components/board/shapesPreview"
import type { SceneElement } from "@/components/board/boardOps"
import { cn } from "@/lib/utils/helpers/cn"

/** A thing in a frame, drawn small: its box as a share of the frame's, in its tint. */
export interface ThumbPart {
  x: number
  y: number
  w: number
  h: number
  tint: string
}

/** What each frame on the scene holds: a frame's id to the things in it (a shape's label goes with its shape). Pure. */
export function insideFrames(elements: readonly SceneElement[]): Map<string, SceneElement[]> {
  const byFrame = new Map<string, SceneElement[]>()
  for (const e of elements) {
    if (e.isDeleted || !e.frameId || (e.type === "text" && e.containerId)) continue
    const list = byFrame.get(e.frameId) ?? []
    list.push(e)
    byFrame.set(e.frameId, list)
  }
  return byFrame
}

/** What `inside` the frame draws as, the first 40 things: a note in its paper's tint, anything else in a line's. Pure. */
export function thumbParts(frame: SceneElement, inside: readonly SceneElement[]): ThumbPart[] {
  return inside.slice(0, 40).map((e) => ({
    x: (e.x - frame.x) / frame.width,
    y: (e.y - frame.y) / frame.height,
    w: e.width / frame.width,
    h: e.height / frame.height,
    tint: isStickyNote(e as never) ? noteTint(noteColourOf(e)) : "var(--line-2)",
  }))
}

/**
 * A frame drawn small: a row's thumbnail (56 px at most), or, with `fill`, as big as its box allows at the frame's own
 * shape, on its paper (a slide's tile).
 */
export function FrameThumb({ frame, parts, fill = false }: { frame: Pick<SceneElement, "width" | "height">; parts: readonly ThumbPart[]; fill?: boolean }) {
  const ratio = frame.width / Math.max(1, frame.height)
  const w = ratio >= 1.4 ? 56 : Math.max(24, Math.round(40 * ratio))
  const h = Math.round(w / ratio)
  const vh = Math.round(100 / ratio)
  return (
    <svg
      width={fill ? undefined : w}
      height={fill ? undefined : Math.min(h, 40)}
      viewBox={`0 0 100 ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className={cn("shrink-0", fill ? "size-full" : "rounded-[4px] bg-raised shadow-e1")}
    >
      {fill && <rect width={100} height={vh} rx={3} fill="var(--raised)" stroke="var(--line-2)" strokeWidth={0.75} />}
      {parts.map((n, i) => (
        <rect key={i} x={n.x * 100} y={(n.y * 100) / ratio} width={Math.max(2, n.w * 100)} height={Math.max(2, (n.h * 100) / ratio)} rx={2} fill={n.tint} />
      ))}
    </svg>
  )
}
