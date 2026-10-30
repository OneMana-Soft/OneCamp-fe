"use client"

// A small map of the board (miro-04 3), on a computer: a Map button at the end
// of the zoom and undo cluster opens a card above it with everything drawn,
// shrunk to fit, and the part this screen shows outlined in the brand colour.
// A press or a drag on the map brings that part of the board to the middle of
// the screen; with the map focused, the arrow keys move a quarter screen at a
// time. Open or closed is kept for the next board this person opens. The
// rules are lib/board/boardMap's.
//
// The drawing is painted once a change to the board (never per frame of a
// pan: the outline moves on its own), in the board's light colours, and the
// card takes Excalidraw's own dark filter (--theme-filter), as the canvas does.
// It lives inside Excalidraw's cluster (a portal), so it sits where its
// button is however the cluster moves.

import * as React from "react"
import { createPortal } from "react-dom"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useSceneElements } from "@/hooks/useSceneElements"
import { isBoolean, useStoredState } from "@/hooks/useStoredState"
import { useBoardView } from "@/hooks/useBoardView"
import { ZOOM_CLUSTER, useExcalidrawPart } from "@/components/board/excalidrawPart"
// From lucide-react itself: an export in lib/icons counts toward every page that imports it (the doc page's ceiling).
import { MapIcon } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { centreOn } from "@/lib/board/hereNow"
import { fromMap, mapFrame, shownBox, toMap, type MapFrame } from "@/lib/board/boardMap"
import { drawnBox } from "@/lib/board/scene"

export const MAP_W = 216
export const MAP_H = 144
const KEPT = "onecamp:board:map"

type Drawn = { id: string; type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; backgroundColor?: string; strokeColor?: string; points?: readonly (readonly [number, number])[] }

/** Paints the drawing on the map: each thing as a small block in its own fill, a frame as its outline. */
function paint(ctx: CanvasRenderingContext2D, els: readonly Drawn[], f: MapFrame) {
  ctx.clearRect(0, 0, MAP_W, MAP_H)
  for (const el of els) {
    if (el.isDeleted) continue
    const a = toMap(f, el.x, el.y)
    const w = Math.max(el.width * f.scale, 1.5)
    const h = Math.max(el.height * f.scale, 1.5)
    if (el.type === "frame" || el.type === "magicframe") {
      ctx.strokeStyle = "#9A9CA3"
      ctx.lineWidth = 1
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, w, h)
    } else if (el.points && el.points.length > 1) {
      ctx.strokeStyle = el.strokeColor || "#1e1e1e"
      ctx.lineWidth = 1
      ctx.beginPath()
      el.points.forEach(([px, py], i) => {
        const p = toMap(f, el.x + px, el.y + py)
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.stroke()
    } else {
      const fill = el.backgroundColor && el.backgroundColor !== "transparent" ? el.backgroundColor : el.type === "text" ? "#C9CBD1" : el.strokeColor || "#1e1e1e"
      ctx.fillStyle = fill
      ctx.globalAlpha = el.type === "text" ? 0.9 : 1
      ctx.fillRect(a.x, a.y, w, h)
      ctx.globalAlpha = 1
    }
  }
}

export function BoardMap({ api, host }: { api: ExcalidrawImperativeAPI; host: HTMLElement | null }) {
  // Open or closed as this browser last left it; nothing is drawn until that's read, so a kept-open map doesn't open a moment late.
  const [open, setOpen, loaded] = useStoredState(KEPT, false, isBoolean)
  const toggle = () => setOpen((o) => !o)
  const cluster = useExcalidrawPart(host, ZOOM_CLUSTER)
  // The drawing and the view are followed only while the map is open.
  const all = useSceneElements<Drawn>(api, open)
  const view = useBoardView(api, open)
  const drawn = React.useMemo(() => (open ? drawnBox(all) : null), [all, open])
  // Held still while a drag is on, so the map doesn't move under the pointer as the outline does.
  const [held, setHeld] = React.useState<MapFrame | null>(null)
  const frame = React.useMemo(() => (view ? (held ?? mapFrame(drawn, shownBox(view), MAP_W, MAP_H)) : null), [view, drawn, held])

  // Painted again only for a change to the board or to the frame (the outline left the drawing's box), never for a
  // pan inside it: the outline moves on its own.
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const painted = React.useRef<{ all: readonly Drawn[]; key: string } | null>(null)
  React.useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext("2d")
    if (!c || !ctx || !frame) return
    const key = `${frame.scale}|${frame.ox}|${frame.oy}`
    if (painted.current?.all === all && painted.current.key === key) return
    painted.current = { all, key }
    const dpr = window.devicePixelRatio || 1
    if (c.width !== MAP_W * dpr) {
      c.width = MAP_W * dpr
      c.height = MAP_H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paint(ctx, all, frame)
  }, [all, frame])
  // A map opened again paints afresh.
  React.useEffect(() => {
    if (!open) painted.current = null
  }, [open])

  const goTo = (mx: number, my: number, f: MapFrame) => {
    const s = api.getAppState()
    api.updateScene({ appState: centreOn({ width: s.width, height: s.height, zoom: s.zoom.value }, fromMap(f, mx, my)) })
  }
  const at = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { mx: e.clientX - r.left, my: e.clientY - r.top }
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (!view) return
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (!step) return
    // The map's arrows move the view only: Excalidraw (on the document) would also nudge what is selected.
    e.preventDefault()
    e.stopPropagation()
    const shown = shownBox(view)
    api.updateScene({ appState: { scrollX: view.scrollX - (step[0] * shown.width) / 4, scrollY: view.scrollY - (step[1] * shown.height) / 4 } })
  }

  if (!cluster || !loaded) return null
  const outline = frame && view ? shownBox(view) : null
  const o = outline && frame ? { a: toMap(frame, outline.x, outline.y), w: outline.width * frame.scale, h: outline.height * frame.scale } : null
  return createPortal(
    <span className="relative inline-flex" data-board-map-anchor="">
      <button
        type="button"
        aria-label="Board map"
        title="Board map"
        aria-pressed={open}
        onClick={toggle}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-[10px] text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [&_svg]:size-4",
          open && "bg-press text-ink",
        )}
      >
        <MapIcon />
      </button>
      {open && frame && (
        <div
          role="application"
          aria-label="Board map: press or drag to go there, or use the arrow keys"
          tabIndex={0}
          data-board-map=""
          onKeyDown={onKey}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            setHeld(frame)
            const { mx, my } = at(e)
            goTo(mx, my, frame)
          }}
          onPointerMove={(e) => {
            if (!held) return
            const { mx, my } = at(e)
            goTo(mx, my, held)
          }}
          onPointerUp={() => setHeld(null)}
          onPointerCancel={() => setHeld(null)}
          style={{ width: MAP_W, height: MAP_H }}
          className="content-float absolute bottom-[calc(100%+12px)] right-[-2px] cursor-pointer touch-none overflow-hidden rounded-xl bg-pop shadow-e3 outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <canvas ref={canvas} aria-hidden="true" style={{ width: MAP_W, height: MAP_H, filter: "var(--theme-filter, none)" }} />
          {o && (
            <span
              aria-hidden="true"
              data-board-map-view=""
              className="pointer-events-none absolute rounded-[3px] border-2 border-brand bg-brand/10"
              style={{ left: o.a.x, top: o.a.y, width: Math.max(o.w, 6), height: Math.max(o.h, 6) }}
            />
          )}
        </div>
      )}
    </span>,
    cluster,
  )
}
