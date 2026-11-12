"use client"

/**
 * Everyone else's live cursor on a board: a pointer and a name tag per person,
 * drawn over the canvas in their own colour (boardColours.ts), where they point
 * on the board. Over the canvas, not on it: a dark board's canvas goes through
 * a filter that darkens every colour on it, and Excalidraw colours its own
 * cursors by a hash of the id (27 Oct, M7). It follows the board's scroll and
 * zoom; someone pointing off the part on screen stays at its edge, named.
 * It takes no pointer events, so the board under it works as before.
 *
 * Everyone's laser (miro-28, miro-10) is handed to Excalidraw's own trail for
 * a collaborator (boardPresence's useRemoteLasers): the trail the drawer sees
 * of their own, decaying from its tail while held, in their colour, under
 * their cursor here. A share link's guest sees the lasers and no one's cursor
 * or name, in the markup too. With reduced motion (the app's one check), no
 * trail moves: each laser is a still dot where it points, here, and Excalidraw
 * is handed it let go, so it starts no trail and ends one it drew. (The
 * drawer's own trail is Excalidraw's, with no way to turn it off unpatched.)
 */

import * as React from "react"
import type { Collaborator, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { cursorColours } from "@/components/board/boardColours"
import { type Awareness, useRemoteCursors, useRemoteLasers } from "@/components/board/boardPresence"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { cn } from "@/lib/utils/helpers/cn"

/** The pointer's size on screen. */
const ARROW = { width: 12, height: 16 }
/** Room a name tag needs to the right of its pointer before it goes to the left. */
const TAG_ROOM = 160
/** A still laser's dot across, with reduced motion. */
const DOT = 10

interface View {
  scrollX: number
  scrollY: number
  zoom: number
}

export function BoardCursors({
  api,
  awareness,
  dark,
  cursors: named = true,
}: {
  api: ExcalidrawImperativeAPI | null
  awareness: Awareness | null | undefined
  /** The board is dark on screen (a call's stage, or the dark theme). */
  dark: boolean
  /** Whether everyone's cursor and name are drawn too: a share link's guest sees only the lasers. */
  cursors?: boolean
}) {
  const cursors = useRemoteCursors(named ? awareness : null)
  const colour = React.useCallback((name: string) => cursorColours(name, dark).fill, [dark])
  const lasers = useRemoteLasers(awareness, colour)
  const still = prefersReducedMotion()
  const [view, setView] = React.useState<View | null>(null)
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  const boxRef = React.useRef<HTMLDivElement>(null)

  // Where the board is scrolled and how far it is zoomed, live.
  React.useEffect(() => {
    if (!api) {
      setView(null)
      return
    }
    const s = api.getAppState()
    setView({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value })
    return api.onScrollChange((scrollX, scrollY, zoom) => setView({ scrollX, scrollY, zoom: zoom.value }))
  }, [api])

  // Everyone's lasers to Excalidraw's trails, as they change: none at all on a board where no one has lasered, and
  // the board told once no one does any more. With reduced motion, each let go: no trail starts, and a live one ends.
  const told = React.useRef<ExcalidrawImperativeAPI | null>(null)
  React.useEffect(() => {
    if (!api || (lasers.size === 0 && told.current !== api)) return
    const letGo = (c: Collaborator): Collaborator => (c.pointer ? { ...c, button: "up" } : c)
    api.updateScene({ collaborators: still ? new Map([...lasers].map(([k, c]) => [k, letGo(c)])) : lasers })
    told.current = lasers.size > 0 ? api : null
  }, [api, lasers, still])

  // The part of the board on screen.
  React.useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={boxRef} aria-hidden="true" data-board-cursors="" className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      {view &&
        still &&
        [...lasers].map(
          ([key, { pointer: p }]) =>
            p && (
              <svg
                key={key}
                data-laser-dot=""
                width={DOT}
                height={DOT}
                viewBox={`${-DOT / 2} ${-DOT / 2} ${DOT} ${DOT}`}
                className="absolute left-0 top-0 block"
                style={{ transform: `translate(${(p.x + view.scrollX) * view.zoom}px, ${(p.y + view.scrollY) * view.zoom}px)`, margin: -DOT / 2 }}
              >
                <circle r={DOT / 2} fill={p.laserColor} />
              </svg>
            ),
        )}
      {view &&
        cursors.map((c) => {
          // The board's coordinates on screen, as Excalidraw places them.
          const x = (c.pointer.x + view.scrollX) * view.zoom
          const y = (c.pointer.y + view.scrollY) * view.zoom
          const left = Math.min(Math.max(x, 0), Math.max(0, size.width - ARROW.width))
          const top = Math.min(Math.max(y, 0), Math.max(0, size.height - ARROW.height))
          const { fill, text, edge } = cursorColours(c.name, dark)
          return (
            <div
              key={c.key}
              data-cursor={c.name}
              data-off-board={left !== x || top !== y ? "" : undefined}
              className="absolute left-0 top-0"
              style={{ transform: `translate(${left}px, ${top}px)` }}
            >
              <svg width={ARROW.width} height={ARROW.height} viewBox="0 0 12 16" className="block overflow-visible">
                {c.button === "down" && <circle cx="1" cy="1" r="9" fill="none" stroke={fill} strokeWidth="2" />}
                <path d="M1 1 L1 14 L4.5 10.5 L10.5 10 Z" fill={fill} stroke={edge} strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <span
                data-cursor-tag=""
                className={cn(
                  "absolute top-[15px] whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-semibold leading-4",
                  left > size.width - TAG_ROOM ? "right-[2px]" : "left-[6px]",
                )}
                style={{ background: fill, color: text, boxShadow: `0 0 0 1px ${edge}` }}
              >
                {c.name}
              </span>
            </div>
          )
        })}
    </div>
  )
}
