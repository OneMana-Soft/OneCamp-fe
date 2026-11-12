"use client"

// The Frames panel (miro-04, miro-11): every frame on the board, in an order
// the board keeps for everyone (and presenting will follow, W-3). A press
// jumps to a frame; a double-click, F2 or Enter renames it; dragging its grip,
// or Alt with ↑ and ↓, moves it in the order; and each has a link that opens
// the board there. An editor's Add a frame, at its foot, lists the sizes a
// frame starts at (framePresets, the Frame tool's list): a phone's way to them.
// A side panel on a computer, a sheet on a phone. An editor's row has the
// frame's presenter notes too (miro-28 2a, components/board/slideNotes), read
// and written through the page's `frameNotes`: a view-only member never asks.

import * as React from "react"
import { useSceneElements } from "@/hooks/useSceneElements"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useSheetMode } from "@/components/ui/overlayMode"
import { useToast } from "@/hooks/use-toast"
import { GripVertical, Link2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { fieldKeyDown } from "@/lib/keys/ime"
import { frameLink, moveFrame, orderFrames } from "@/lib/board/frames"
import { useFrameOrder } from "@/components/board/useBoardDeck"
import { isStickyNote } from "@/lib/board/notes"
import { addPresetFrame, changeElements, type SceneElement } from "@/components/board/boardOps"
import { FramePresetList } from "@/components/board/framePresets"
import { peekRows } from "@/components/ui/sheetPeek"
import { Button } from "@/components/ui/button"
import { FrameThumb, insideFrames, thumbParts, type ThumbPart } from "@/components/board/frameThumb"
import { BoardSidePanel, SIDE_PANELS } from "@/components/board/boardSidePanel"
import { FrameNotesButton } from "@/components/board/slideNotes"
import type { FrameNotesReads, FrameNotesSource } from "@/components/board/frameNotesReads"

interface FrameRow {
  frame: SceneElement
  /** What's in it, scaled into the frame's small picture. */
  notes: ThumbPart[]
  /** What's in it, in words: its notes by name, the rest as things. */
  holds: string
}

/** What a frame holds, in words: its notes by name, anything else as things. Pure. */
function holdings(total: number, notes: number): string {
  const others = total - notes
  if (total === 0) return "Empty"
  if (notes === 0) return others === 1 ? "1 thing" : `${others} things`
  // Sticky notes, said so: beside a row's Notes (its presenter notes) "1 note" read as the same kind (DB-133 F1).
  const named = notes === 1 ? "1 sticky note" : `${notes} sticky notes`
  if (others === 0) return named
  return `${named}, ${others === 1 ? "1 other thing" : `${others} other things`}`
}

/** The board's frames as the panel lists them, in the kept order. Pure apart from reading the scene. */
function readFrames(elements: readonly SceneElement[], order: readonly string[] | null): FrameRow[] {
  const frames = elements.filter((e) => e.type === "frame" && !e.isDeleted)
  const byFrame = insideFrames(elements)
  return orderFrames(frames, order).map((frame) => {
    const inside = byFrame.get(frame.id) ?? []
    return {
      frame,
      holds: holdings(inside.length, inside.filter((e) => isStickyNote(e as never)).length),
      notes: thumbParts(frame, inside),
    }
  })
}

export default function FramesPanel({
  api,
  provider,
  boardId,
  editable,
  frameNotes: WithFrameNotes,
  onClose,
}: {
  api: ExcalidrawImperativeAPI
  provider: HocuspocusProvider
  boardId: string
  editable: boolean
  /** Presenter notes' read and write, from the board page's first load (components/board/frameNotesReads). */
  frameNotes?: FrameNotesSource
  onClose: () => void
}) {
  const sheet = useSheetMode()
  const { toast } = useToast()
  const meta = React.useMemo(() => provider.document.getMap<unknown>("boardMeta"), [provider])

  // The kept order, live for everyone (the one reader, with the slides that follow it).
  const order = useFrameOrder(provider.document)

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

  // Add a frame (an editor's): the sizes a frame starts at, in place of the list until one is picked. A phone's way
  // to them (it has no Frame tool beside the tools); on its sheet the pick closes the sheet, to show the frame.
  const [adding, setAdding] = React.useState(false)
  const add = (presetId: string) => {
    if (!addPresetFrame(api, presetId)) return
    setAdding(false)
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

  const body = (notes?: FrameNotesReads) => (
    <>
      {adding ? (
        <div data-frame-add="">
          <p className="px-2 pb-1 pt-1.5 text-meta font-medium text-ink-3">Add a frame</p>
          <FramePresetList onPick={add} sheet={sheet} ref={sheet ? peekRows : undefined} />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center" data-frames-empty="">
          <svg viewBox="0 0 48 32" aria-hidden="true" className="h-8 w-12 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 10V4h6M38 4h6v6M44 22v6h-6M10 28H4v-6" />
          </svg>
          <p className="text-ui font-medium text-ink">No frames yet</p>
          <p className="text-ui-sm text-ink-3">
            {editable ? (sheet ? "Add one below. " : "Add one below, or draw one with F. ") : ""}Frames keep a part of the board together, and present as slides.
          </p>
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
                <FrameThumb frame={row.frame} parts={row.notes} />
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
                {editable && notes && <FrameNotesButton frame={row.frame.id} name={row.frame.name || "Untitled frame"} reads={notes} />}
              </li>
            )
          })}
        </ol>
      )}
    </>
  )

  // An editor's Add a frame, pinned under the list; Back while the sizes show. Full-size on a phone's sheet.
  const footer = (sheet: boolean) =>
    editable && (
      <div data-frames-foot="" className="flex">
        <Button
          variant={adding ? "ghost" : sheet ? "default" : "secondary"}
          size={sheet ? "lg" : "sm"}
          className={sheet ? "h-11 flex-1" : "flex-1"}
          onClick={() => setAdding((a) => !a)}
        >
          {adding ? "Back to frames" : "Add a frame"}
        </Button>
      </div>
    )

  return (
    // While the sizes show, a phone's sheet grows to fit all eight (medium), where half cut Phone off (miro-11 F1).
    <BoardSidePanel {...SIDE_PANELS.frames()} detent={adding ? "medium" : undefined} count={rows.length} footer={footer} onClose={onClose}>
      {WithFrameNotes ? (
        <WithFrameNotes board={boardId} may={editable}>
          {body}
        </WithFrameNotes>
      ) : (
        body()
      )}
    </BoardSidePanel>
  )
}
