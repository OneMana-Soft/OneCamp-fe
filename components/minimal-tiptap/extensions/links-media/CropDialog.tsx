"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/helpers/cn"
import { viewableFileUrl } from "@/lib/docFiles"
import { cropBox, cropString, FULL_CROP as FULL, type CropBox as Box } from "../image/crop"
import { takePendingImage } from "./blockActions"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"

type Grip = "move" | "nw" | "ne" | "sw" | "se"
const MIN = 0.05
const RATIOS: Array<[string, number | null]> = [
  ["Free", null],
  ["Square", 1],
  ["4:3", 4 / 3],
  ["16:9", 16 / 9],
]

const clamp = (b: Box): Box => {
  const w = Math.min(1, Math.max(MIN, b.w))
  const h = Math.min(1, Math.max(MIN, b.h))
  return { w, h, x: Math.min(1 - w, Math.max(0, b.x)), y: Math.min(1 - h, Math.max(0, b.y)) }
}

/**
 * Crop (small-details V25): a frame over the picture, dragged by its corners
 * or its middle, or moved with the arrow keys (Shift and the arrows resize
 * it), free or held to a shape. Nothing is cut from the file: the picture
 * keeps the frame (its crop), and Reset gives the whole picture back.
 */
export default function CropDialog({ onClose }: { docId: string; onClose(): void }) {
  const [target] = React.useState(takePendingImage)
  React.useEffect(() => () => target?.done(), [target])
  React.useEffect(() => {
    if (!target) onClose()
  }, [target, onClose])
  const [box, setBox] = React.useState<Box>(() => cropBox(target?.node.attrs.crop))
  const [ratio, setRatio] = React.useState<number | null>(null)
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null)
  const area = React.useRef<HTMLDivElement>(null)
  if (!target) return null

  /** The box held to the chosen shape, from its width. */
  const shaped = (b: Box, r = ratio): Box => (r && size ? clamp({ ...b, h: (b.w * size.w) / (size.h * r) }) : clamp(b))

  const drag = (grip: Grip) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = area.current?.getBoundingClientRect()
    if (!rect) return
    const start = { px: e.clientX, py: e.clientY, b: box }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.px) / rect.width
      const dy = (ev.clientY - start.py) / rect.height
      const b = start.b
      if (grip === "move") return setBox(clamp({ ...b, x: b.x + dx, y: b.y + dy }))
      const left = grip === "nw" || grip === "sw"
      const top = grip === "nw" || grip === "ne"
      const w = b.w + (left ? -dx : dx)
      const h = b.h + (top ? -dy : dy)
      const next = shaped({ x: left ? b.x + b.w - w : b.x, y: top ? b.y + b.h - h : b.y, w, h })
      setBox(next)
    }
    const up = () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
      el.removeEventListener("pointercancel", up)
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
    el.addEventListener("pointercancel", up)
  }

  const keys = (e: React.KeyboardEvent) => {
    const step = 0.01
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!d) return
    e.preventDefault()
    setBox((b) => (e.shiftKey ? shaped({ ...b, w: b.w + d[0], h: b.h + d[1] }) : clamp({ ...b, x: b.x + d[0], y: b.y + d[1] })))
  }

  const pct = (v: number) => `${v * 100}%`
  const src = viewableFileUrl(String(target.node.attrs.src || ""), false)
  const grips: Array<[Grip, string]> = [
    ["nw", "-left-1.5 -top-1.5 cursor-nwse-resize"],
    ["ne", "-right-1.5 -top-1.5 cursor-nesw-resize"],
    ["sw", "-bottom-1.5 -left-1.5 cursor-nesw-resize"],
    ["se", "-bottom-1.5 -right-1.5 cursor-nwse-resize"],
  ]

  return (
    <ResponsiveDialog
      wide
      title="Crop"
      description="Drag the frame or its corners. The arrow keys move it; with Shift they resize it."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" className="mr-auto" onClick={() => setBox(FULL)}>
            Reset
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              // The picture takes the frame's shape at its width (or finds it again as it loads).
              const width = Number(target.node.attrs.width) || 0
              const height = width && size ? Math.round((width * (box.h * size.h)) / (box.w * size.w)) : null
              target.save({ crop: cropString(box), height }, "crop")
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="mb-3 flex gap-1" role="group" aria-label="Shape">
        {RATIOS.map(([label, r]) => (
          <Button
            key={label}
            type="button"
            size="sm"
            variant={ratio === r ? "subtle" : "ghost"}
            aria-pressed={ratio === r}
            onClick={() => {
              setRatio(r)
              setBox((b) => shaped(b, r))
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex justify-center rounded-lg bg-sunken p-3">
        <div ref={area} className="relative max-w-full touch-none select-none">
          <img
            src={src}
            alt={String(target.node.attrs.alt || "")}
            draggable={false}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="block max-h-[55vh] max-w-full"
          />
          {/* What the frame leaves out, dimmed as the lightbox dims (bg-black). */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 bg-black/50" style={{ height: pct(box.y) }} />
            <div className="absolute inset-x-0 bottom-0 bg-black/50" style={{ height: pct(1 - box.y - box.h) }} />
            <div className="absolute left-0 bg-black/50" style={{ top: pct(box.y), height: pct(box.h), width: pct(box.x) }} />
            <div className="absolute right-0 bg-black/50" style={{ top: pct(box.y), height: pct(box.h), width: pct(1 - box.x - box.w) }} />
          </div>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Crop frame"
            aria-valuemin={5}
            aria-valuemax={100}
            aria-valuenow={Math.round(box.w * 100)}
            aria-valuetext={`${Math.round(box.w * 100)}% wide, ${Math.round(box.h * 100)}% high, ${Math.round(box.x * 100)}% from the left, ${Math.round(box.y * 100)}% from the top`}
            onKeyDown={keys}
            onPointerDown={drag("move")}
            className="absolute cursor-move outline-none ring-2 ring-white focus-visible:ring-brand"
            style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }}
          >
            {grips.map(([g, place]) => (
              <span key={g} aria-hidden="true" onPointerDown={drag(g)} className={cn("absolute size-3 rounded-[4px] bg-white shadow-e2 max-sm:size-5", place)} />
            ))}
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  )
}
