"use client"

// The Frames panel (miro-04, miro-11): every frame on the board, in an order
// the board keeps for everyone (and presenting will follow, W-3). A press
// jumps to a frame; a double-click, F2 or Enter renames it; dragging its grip,
// or Alt with ↑ and ↓, moves it in the order; and each has a link that opens
// the board there. A side panel on a computer, a sheet on a phone.

import * as React from "react"
import { useSceneElements } from "@/hooks/useSceneElements"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useSheetMode } from "@/components/ui/overlayMode"
import { useToast } from "@/hooks/use-toast"
import { GripVertical, Link2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { fieldKeyDown } from "@/lib/keys/ime"
import { frameLink, frameOrderOf, moveFrame, orderFrames } from "@/lib/board/frames"
import { isStickyNote, noteColourOf } from "@/lib/board/notes"
import { changeElements, type SceneElement } from "@/components/board/boardOps"
import { noteTint } from "@/components/board/shapesPreview"
import { BoardSidePanel } from "@/components/board/boardSidePanel"

interface FrameRow {
  frame: SceneElement
  /** What's in it, scaled into the frame's small picture. */
  notes: { x: number; y: number; w: number; h: number; tint: string }[]
  /** What's in it, in words: its notes by name, the rest as things. */
  holds: string
}

/** What a frame holds, in words: its notes by name, anything else as things. Pure. */
function holdings(total: number, notes: number): string {
  const others = total - notes
  if (total === 0) return "Empty"
  if (notes === 0) return others === 1 ? "1 thing" : `${others} things`
  const named = notes === 1 ? "1 note" : `${notes} notes`
  if (others === 0) return named
  return `${named}, ${others === 1 ? "1 other thing" : `${others} other things`}`
}

/** The board's frames as the panel lists them, in the kept order. Pure apart from reading the scene. */
function readFrames(elements: readonly SceneElement[], order: readonly string[] | null): FrameRow[] {
  const frames = elements.filter((e) => e.type === "frame" && !e.isDeleted)
  const byFrame = new Map<string, SceneElement[]>()
  for (const e of elements) {
    if (e.isDeleted || !e.frameId || (e.type === "text" && e.containerId)) continue
    const list = byFrame.get(e.frameId) ?? []
    list.push(e)
    byFrame.set(e.frameId, list)
  }
  return orderFrames(frames, order).map((frame) => {
    const inside = byFrame.get(frame.id) ?? []
    return {
      frame,
      holds: holdings(inside.length, inside.filter((e) => isStickyNote(e as never)).length),
      notes: inside.slice(0, 40).map((e) => ({
        x: (e.x - frame.x) / frame.width,
        y: (e.y - frame.y) / frame.height,
        w: e.width / frame.width,
        h: e.height / frame.height,
        tint: isStickyNote(e as never) ? noteTint(noteColourOf(e)) : "var(--line-2)",
      })),
    }
  })
}

/** A frame drawn small: its shape, and its notes in their colours. */
function FrameThumb({ row }: { row: FrameRow }) {
  const ratio = row.frame.width / Math.max(1, row.frame.height)
  const w = ratio >= 1.4 ? 56 : Math.max(24, Math.round(40 * ratio))
  const h = Math.round(w / ratio)
  return (
    <svg width={w} height={Math.min(h, 40)} viewBox={`0 0 100 ${Math.round(100 / ratio)}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" className="shrink-0 rounded-[4px] bg-raised shadow-e1">
      {row.notes.map((n, i) => (
        <rect key={i} x={n.x * 100} y={(n.y * 100) / ratio} width={Math.max(2, n.w * 100)} height={Math.max(2, (n.h * 100) / ratio)} rx={2} fill={n.tint} />
      ))}
    </svg>
  )
}

export default function FramesPanel({
  api,
  provider,
  boardId,
  editable,
  onClose,
}: {
  api: ExcalidrawImperativeAPI
  provider: HocuspocusProvider
  boardId: string
  editable: boolean
  onClose: () => void
}) {
  const sheet = useSheetMode()
  const { toast } = useToast()
  const meta = React.useMemo(() => provider.document.getMap<unknown>("boardMeta"), [provider])

  // The kept order, live for everyone.
  const [order, setOrder] = React.useState<string[] | null>(null)
  React.useEffect(() => {
    const read = () => setOrder(frameOrderOf(meta))
    read()
    meta.observe(read)
    return () => meta.unobserve(read)
  }, [meta])

  // The frames, read again only when the scene changes (a pan is no change).
  const elements = useSceneElements<SceneElement>(api)
  const rows = React.useMemo(() => readFrames(elements, order), [elements, order])

  const keepOrder = (ids: string[]) => provider.document.transact(() => meta.set("frameOrder", ids))
  const move = (from: number, to: number) => keepOrder(moveFrame(rows.map((r) => r.frame.id), from, to))

  const jump = (frame: SceneElement) => {
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } as never })
    api.scrollToContent([frame] as never, { fitToContent: true, animate: true })
    if (sheet) onClose()
  }

  const [renaming, setRenaming] = React.useState<string | null>(null)
  const rename = (id: string, name: string) => {
    setRenaming(null)
    const next = name.trim()
    if (!next) return
    changeElements(api, (el) => (el.id === id && el.type === "frame" && el.name !== next ? { name: next } : null))
  }

  const copyLink = async (id: string) => {
    const link = frameLink(window.location.origin, boardId, id)
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: "Link copied", description: "It opens the board at this frame." })
    } catch {
      toast({ title: "The link couldn't be copied", description: link })
    }
  }

  // Dragging a row by its grip: where it would land, by the rows' middles.
  const list = React.useRef<HTMLOListElement>(null)
  const [drag, setDrag] = React.useState<{ from: number; to: number } | null>(null)
  const startDrag = (from: number) => (e: React.PointerEvent) => {
    if (!editable) return
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    setDrag({ from, to: from })
    const over = (y: number) => {
      const items = Array.from(list.current?.querySelectorAll<HTMLElement>("[data-frame-row]") ?? [])
      let to = items.length - 1
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect()
        if (y < r.top + r.height / 2) {
          to = i
          break
        }
      }
      setDrag((d) => (d && d.to !== to ? { from: d.from, to } : d))
    }
    const moveH = (ev: PointerEvent) => over(ev.clientY)
    const up = () => {
      target.removeEventListener("pointermove", moveH)
      target.removeEventListener("pointerup", up)
      target.removeEventListener("pointercancel", up)
      setDrag((d) => {
        if (d && d.to !== d.from) move(d.from, d.to)
        return null
      })
    }
    target.addEventListener("pointermove", moveH)
    target.addEventListener("pointerup", up)
    target.addEventListener("pointercancel", up)
  }

  const body = (
    <>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center" data-frames-empty="">
          <svg viewBox="0 0 48 32" aria-hidden="true" className="h-8 w-12 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 10V4h6M38 4h6v6M44 22v6h-6M10 28H4v-6" />
          </svg>
          <p className="text-ui font-medium text-ink">No frames yet</p>
          <p className="text-ui-sm text-ink-3">Add one from Frame, beside the tools, or draw one with F. Frames keep a part of the board together, and present as slides.</p>
        </div>
      ) : (
        <ol ref={list} className="grid gap-px" aria-label="Frames, in order">
          {rows.map((row, i) => {
            const shifted = drag && drag.from !== i && ((drag.from < i && drag.to >= i) || (drag.from > i && drag.to <= i))
            return (
              <li
                key={row.frame.id}
                data-frame-row={row.frame.id}
                className={cn(
                  "group/frame flex min-h-12 items-center gap-2 rounded-lg px-1.5 py-1.5 transition-transform duration-[160ms] max-sm:min-h-14",
                  drag?.from === i ? "bg-press shadow-e2" : "hover:bg-hover",
                  shifted && (drag!.from < i ? "-translate-y-1" : "translate-y-1"),
                )}
              >
                {editable && (
                  <button
                    type="button"
                    aria-label={`Move ${row.frame.name || "frame"}: drag, or Alt with the arrow keys`}
                    onPointerDown={startDrag(i)}
                    onKeyDown={(e) => {
                      if (!e.altKey) return
                      if (e.key === "ArrowUp" && i > 0) {
                        e.preventDefault()
                        move(i, i - 1)
                      } else if (e.key === "ArrowDown" && i < rows.length - 1) {
                        e.preventDefault()
                        move(i, i + 1)
                      }
                    }}
                    className="inline-flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink-3 outline-none hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing max-sm:h-11 [&_svg]:size-3.5"
                  >
                    <GripVertical />
                  </button>
                )}
                <span className="w-5 shrink-0 text-right text-meta tabular-nums text-ink-3">{i + 1}</span>
                <FrameThumb row={row} />
                {renaming === row.frame.id ? (
                  <input
                    autoFocus
                    defaultValue={row.frame.name ?? ""}
                    aria-label="Frame name"
                    data-escape-own=""
                    onBlur={(e) => rename(row.frame.id, e.target.value)}
                    onKeyDown={fieldKeyDown((e) => {
                      if (e.key === "Enter") rename(row.frame.id, (e.target as HTMLInputElement).value)
                      if (e.key === "Escape") {
                        e.stopPropagation()
                        setRenaming(null)
                      }
                    })}
                    className="h-8 min-w-0 flex-1 rounded-md bg-raised px-1.5 text-ui text-ink shadow-e1 outline-none focus:focus-halo max-sm:text-base"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => jump(row.frame)}
                    onDoubleClick={() => editable && setRenaming(row.frame.id)}
                    onKeyDown={(e) => {
                      if (editable && (e.key === "F2" || (e.key === "Enter" && e.shiftKey))) {
                        e.preventDefault()
                        setRenaming(row.frame.id)
                      }
                    }}
                    className="min-w-0 flex-1 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    title="Go to this frame. Double-click to rename."
                  >
                    <span className="block truncate text-ui font-[450] text-ink">{row.frame.name || "Untitled frame"}</span>
                    <span className="block text-meta text-ink-3 tabular-nums">{row.holds}</span>
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Copy a link to ${row.frame.name || "this frame"}`}
                  title="Copy a link to this frame"
                  onClick={() => void copyLink(row.frame.id)}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 outline-none transition-opacity hover:bg-hover hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand group-hover/frame:opacity-100 max-sm:size-11 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 [&_svg]:size-4"
                >
                  <Link2 />
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </>
  )

  return (
    <BoardSidePanel name="Frames" closeLabel="Close frames" count={rows.length} onClose={onClose} data-frames-panel="">
      {body}
    </BoardSidePanel>
  )
}
