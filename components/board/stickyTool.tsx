"use client"

// The sticky tool (miro-07) and frames' sizes (miro-11), beside Excalidraw's
// tool bar:
//
//  - Note (N): click or tap the board to put a note there, and type. The
//    note takes the colour last chosen, on this browser.
//  - Tab adds the next note beside the one you're in or have selected
//    (Shift+Tab below it), in its colour and size, and types in it: a run of
//    ideas without the mouse, as in Miro.
//  - A pasted list becomes a grid of notes, one a line (Miro's bulk mode).
//  - Frame: the sizes a frame starts at (16:9, A4, phone…), or draw one (F).
//
// The phone has no tool bar of ours yet (W-9): its "Add a note" button (the
// page's cluster) puts a note in the middle of the view, typing.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ClusterButton, ClusterDivider } from "@/components/board/boardChrome"
import { useMedia } from "@/context/MediaQueryContext"
import { ariaKeys, notForTheBoard, withKey } from "@/components/board/boardKeys"
import { ChevronDown } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import {
  ALL_NOTE_COLOURS,
  CAMP_NOTE_COLOURS,
  NOTE_COLOURS,
  NOTE_SIZES,
  isStickyNote,
  noteColourOf,
  noteSizeOf,
  noteSkeleton,
  type BoardStyle,
  type NoteColourId,
} from "@/lib/board/notes"
import { nextNoteSpot, noteGrid, notesFromText } from "@/lib/board/sticky"
import { FRAME_PRESETS, nextFrameName } from "@/lib/board/frames"
import { addFrame, addNotes, frameElement, selectAndEdit, viewMiddle, type SceneElement } from "@/components/board/boardOps"
import { newElementId } from "@/lib/board/ids"
import { onEscape } from "@/lib/keys/onEscape"
import type { BoardSelection } from "@/components/board/boardWorkbench"

const COLOUR_KEY = "onecamp:board:noteColour"

function savedColour(): NoteColourId {
  try {
    const c = localStorage.getItem(COLOUR_KEY)
    if (c && c in NOTE_COLOURS) return c as NoteColourId
  } catch {
    /* a private window: yellow */
  }
  return "yellow"
}

/** Excalidraw's own container, where it takes its keys (Enter starts typing in a selected note). */
function excalidrawContainer(): Element | null {
  return document.querySelector("[data-board-canvas] .excalidraw")
}

/** A small sticky note, drawn: the glyph of the Note tool, in a note colour. */
export function NoteGlyph({ colour, className }: { colour: NoteColourId; className?: string }) {
  const c = NOTE_COLOURS[colour]
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-4", className)}>
      <path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6.2L9.7 13.5H3.5a1 1 0 0 1-1-1z" fill={c.fill} stroke={c.edge} strokeWidth="1.1" />
      <path d="M9.7 13.5v-2.8a1 1 0 0 1 1-1h2.8" fill="none" stroke={c.edge} strokeWidth="1.1" />
      <path d="M5 6.2h5M5 8.4h3.2" stroke={c.ink} strokeWidth="1.1" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}

/** A frame's glyph: corners only, the way Excalidraw draws a frame's edge. */
function FrameGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />
    </svg>
  )
}

/** Swatches for the sixteen note colours, the camp six first. */
export function NoteSwatches({ value, onPick, keyed }: { value: NoteColourId | null; onPick: (c: NoteColourId) => void; keyed?: boolean }) {
  // The notes bar's swatches say their keys (Alt+1 to Alt+6, components/board/boardKeys).
  const chord = (c: NoteColourId) => (keyed && CAMP_NOTE_COLOURS.includes(c) ? `Alt-${CAMP_NOTE_COLOURS.indexOf(c) + 1}` : null)
  const swatch = (c: NoteColourId) => (
    <button
      key={c}
      type="button"
      aria-label={NOTE_COLOURS[c].label}
      aria-pressed={value === c}
      title={chord(c) ? withKey(NOTE_COLOURS[c].label, chord(c)!) : NOTE_COLOURS[c].label}
      aria-keyshortcuts={chord(c) ? ariaKeys(chord(c)!) : undefined}
      onClick={() => onPick(c)}
      className={cn(
        "relative size-7 rounded-md outline-none transition-transform duration-[140ms] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand max-sm:size-11",
        value === c && "ring-2 ring-ink ring-offset-2 ring-offset-pop",
      )}
      style={{ background: NOTE_COLOURS[c].fill, boxShadow: `inset 0 0 0 1px ${NOTE_COLOURS[c].edge}` }}
    >
      {value === c && <span aria-hidden="true" className="absolute inset-0 m-auto size-1.5 rounded-full" style={{ background: NOTE_COLOURS[c].ink }} />}
    </button>
  )
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colours">
        {CAMP_NOTE_COLOURS.map(swatch)}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="More colours">
        {ALL_NOTE_COLOURS.filter((c) => !CAMP_NOTE_COLOURS.includes(c)).map(swatch)}
      </div>
    </div>
  )
}

export default function StickyTool({
  api,
  selection,
  style,
  noteNow,
  onFrames,
}: {
  api: ExcalidrawImperativeAPI
  selection: BoardSelection
  style: BoardStyle
  /** A press of the page's "Add a note" (a phone): a note in the middle of the view. */
  noteNow: number
  onFrames: () => void
}) {
  const { isMobile } = useMedia()
  const [armed, setArmed] = React.useState(false)
  const [colour, setColour] = React.useState<NoteColourId>("yellow")
  React.useEffect(() => setColour(savedColour()), [])
  const pickColour = (c: NoteColourId) => {
    setColour(c)
    try {
      localStorage.setItem(COLOUR_KEY, c)
    } catch {
      /* not kept: fine */
    }
  }
  const latest = React.useRef({ colour, style, selection })
  latest.current = { colour, style, selection }

  /** Puts a note centred on a scene point and starts typing in it. */
  const place = React.useCallback(
    async (at: { x: number; y: number }, o: { colour?: NoteColourId; size?: keyof typeof NOTE_SIZES; frameId?: string | null } = {}) => {
      const size = o.size ?? "m"
      const side = NOTE_SIZES[size]
      const id = newElementId("note")
      await addNotes(api, [noteSkeleton({ id, x: at.x - side / 2, y: at.y - side / 2, colour: o.colour ?? latest.current.colour, size, style: latest.current.style })], { frameId: o.frameId })
      selectAndEdit(api, [id], excalidrawContainer())
    },
    [api],
  )

  // The page's phone button.
  React.useEffect(() => {
    if (noteNow) void place(viewMiddle(api))
  }, [noteNow, api, place])

  // ---- placing: a ghost note under the pointer, placed on a press ----------
  const ghost = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!armed) return
    const host = ghost.current?.parentElement
    if (!host) return
    let frame = 0
    let last: PointerEvent | null = null
    const draw = () => {
      frame = 0
      const g = ghost.current
      if (!g || !last) return
      const h = host.getBoundingClientRect()
      const z = api.getAppState().zoom.value
      const side = NOTE_SIZES.m * z
      g.style.width = g.style.height = `${side}px`
      g.style.transform = `translate(${last.clientX - h.left - side / 2}px, ${last.clientY - h.top - side / 2}px)`
      g.style.opacity = "1"
    }
    const move = (e: PointerEvent) => {
      last = e
      if (!frame) frame = requestAnimationFrame(draw)
    }
    const down = (e: PointerEvent) => {
      // Only a press on the canvas itself: the tool bars and cards stay pressable.
      if (!(e.target instanceof HTMLCanvasElement) || e.button > 0) return
      e.preventDefault()
      e.stopPropagation()
      setArmed(false)
      const s = api.getAppState()
      const at = { x: (e.clientX - s.offsetLeft) / s.zoom.value - s.scrollX, y: (e.clientY - s.offsetTop) / s.zoom.value - s.scrollY }
      void place(at)
    }
    // Escape puts the tool down, through the page's one Escape (lib/keys/escape).
    const stopEscape = onEscape("page", () => setArmed(false))
    host.addEventListener("pointermove", move)
    host.addEventListener("pointerdown", down, true)
    return () => {
      stopEscape()
      host.removeEventListener("pointermove", move)
      host.removeEventListener("pointerdown", down, true)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [armed, api, place])

  // ---- keys: N to place a note; Tab and Shift+Tab for the next one --------
  React.useEffect(() => {
    const next = async (fromId: string, direction: "right" | "below") => {
      const all = api.getSceneElements() as unknown as SceneElement[]
      const from = all.find((e) => e.id === fromId)
      if (!from) return
      const taken = all.filter((e) => e.type !== "text" && e.type !== "frame" && e.type !== "arrow" && e.type !== "line")
      const spot = nextNoteSpot(from, taken, direction, from.width)
      const frame = from.frameId ? all.find((e) => e.id === from.frameId) : undefined
      const inside = frame && spot.x >= frame.x && spot.y >= frame.y && spot.x + from.width <= frame.x + frame.width && spot.y + from.height <= frame.y + frame.height
      await place(
        { x: spot.x + from.width / 2, y: spot.y + from.height / 2 },
        { colour: noteColourOf(from) ?? latest.current.colour, size: noteSizeOf(from.width), frameId: inside ? frame!.id : null },
      )
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      // In a note's words (Excalidraw's own editor): Tab ends them and starts the next note.
      if (e.key === "Tab" && target instanceof HTMLTextAreaElement && target.classList.contains("excalidraw-wysiwyg")) {
        const editing = api.getAppState().editingTextElement as { containerId?: string | null } | null
        const container = editing?.containerId ? (api.getSceneElements() as unknown as SceneElement[]).find((x) => x.id === editing.containerId) : undefined
        if (!container || !isStickyNote(container as never)) return
        e.preventDefault()
        e.stopPropagation()
        // Excalidraw's editor keeps the words and ends when it loses focus.
        target.blur()
        const shift = e.shiftKey
        requestAnimationFrame(() => void next(container.id, shift ? "below" : "right"))
        return
      }
      if (notForTheBoard(e)) return
      if (e.key === "Tab") {
        const notes = latest.current.selection.notes
        if (notes.length !== 1) return
        e.preventDefault()
        void next(notes[0], e.shiftKey ? "below" : "right")
        return
      }
      if ((e.key === "n" || e.key === "N") && !e.shiftKey && !e.repeat) {
        e.preventDefault()
        setArmed((a) => !a)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [api, place])

  // ---- a pasted list: a grid of notes, one a line --------------------------
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (notForTheBoard(e)) return
      const text = e.clipboardData?.getData("text/plain") ?? ""
      // Excalidraw's own copy of shapes is JSON: that's its paste, not ours.
      if (!text || /^\s*\{[\s\S]*"type"\s*:\s*"excalidraw/.test(text)) return
      const lines = notesFromText(text)
      if (lines.length < 2) return
      e.preventDefault()
      e.stopPropagation()
      const mid = viewMiddle(api)
      const spots = noteGrid(lines.length, mid.x, mid.y)
      const notes = lines.map((t, i) => noteSkeleton({ id: newElementId("note"), x: spots[i].x, y: spots[i].y, text: t, colour: latest.current.colour, style: latest.current.style }))
      void addNotes(api, notes).then((ids) => {
        const made = (api.getSceneElements() as unknown as SceneElement[]).filter((x) => ids.includes(x.id))
        if (made.length) api.scrollToContent(made as never, { fitToContent: true, animate: true })
      })
    }
    window.addEventListener("paste", onPaste, true)
    return () => window.removeEventListener("paste", onPaste, true)
  }, [api])

  // ---- frames at a size --------------------------------------------------
  const addPresetFrame = (presetId: string) => {
    const p = FRAME_PRESETS.find((f) => f.id === presetId)
    if (!p) return
    const mid = viewMiddle(api)
    const names = (api.getSceneElements() as unknown as SceneElement[]).filter((e) => e.type === "frame").map((e) => e.name)
    const frame = frameElement({ id: newElementId("frame"), x: Math.round(mid.x - p.width / 2), y: Math.round(mid.y - p.height / 2), width: p.width, height: p.height, name: nextFrameName(names), preset: p.id })
    addFrame(api, frame)
    api.scrollToContent([frame] as never, { fitToContent: true, animate: true })
  }

  return (
    <>
      {armed && (
        <div
          ref={ghost}
          aria-hidden="true"
          data-note-ghost=""
          className="pointer-events-none absolute left-0 top-0 z-[2] rounded-[10px] opacity-0 shadow-e2 transition-opacity duration-[120ms]"
          style={{ background: NOTE_COLOURS[colour].fill, boxShadow: `inset 0 0 0 1.5px ${NOTE_COLOURS[colour].edge}` }}
        >
          <span className="absolute inset-x-0 bottom-2 text-center text-meta" style={{ color: NOTE_COLOURS[colour].ink }}>
            Click to place · Esc
          </span>
        </div>
      )}
      {!isMobile && (
        // Left of Excalidraw's tool row, or over its end on a narrow board: placed by the bottom row's one measure
        // (components/board/bottomRow.ts), and hidden until it is (excalidrawTheme.css).
        <div
          role="toolbar"
          aria-label="Notes and frames"
          data-board-create=""
          data-board-chrome=""
          className="content-float pointer-events-auto absolute z-20 flex h-10 items-center gap-0.5 rounded-xl bg-pop p-1 shadow-e3"
          style={{ left: "var(--board-pill-x, 0px)", top: "var(--board-pill-y, 0px)" }}
        >
          <ClusterButton label={armed ? "Click the board to place a note (Esc)" : "Note (N)"} active={armed} onClick={() => setArmed((a) => !a)} data-note-tool="">
            <NoteGlyph colour={colour} />
          </ClusterButton>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Note colour"
                title="Note colour"
                className="inline-flex h-8 w-4 shrink-0 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [&_svg]:size-3"
              >
                <ChevronDown />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={10} className="content-float w-auto rounded-xl bg-pop p-3 shadow-e3">
              <p className="mb-2 text-meta font-medium text-ink-3">New notes</p>
              <NoteSwatches value={colour} onPick={pickColour} />
            </PopoverContent>
          </Popover>
          <ClusterDivider />
          <Popover>
            <PopoverTrigger asChild>
              <ClusterButton label="Frame">
                <FrameGlyph />
              </ClusterButton>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={10} className="content-float w-64 rounded-xl bg-pop p-1.5 shadow-e3" data-frame-presets="">
              <p className="px-2 pb-1 pt-1.5 text-meta font-medium text-ink-3">Add a frame</p>
              <ul className="grid gap-px">
                {FRAME_PRESETS.map((p) => {
                  const w = 18
                  const h = Math.round((p.height / p.width) * w)
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addPresetFrame(p.id)}
                        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-ui text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
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
              <div className="mt-1 border-t border-line pt-1">
                <button
                  type="button"
                  onClick={() => api.setActiveTool({ type: "frame" })}
                  className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-ui text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <span aria-hidden="true" className="flex w-6 justify-center text-ink-3">
                    <FrameGlyph />
                  </span>
                  <span className="flex-1">Draw a frame</span>
                  <kbd className="text-meta text-ink-3">F</kbd>
                </button>
                <button
                  type="button"
                  onClick={onFrames}
                  className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-ui text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <span aria-hidden="true" className="w-6" />
                  <span className="flex-1">All frames…</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </>
  )
}
