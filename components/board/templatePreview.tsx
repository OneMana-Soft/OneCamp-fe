"use client"

// A board template drawn small, from its real layout (content.md B02): the
// same skeleton the template inserts (lib/board/templates), drawn by the one
// small drawing of a board (components/board/shapesPreview).

import * as React from "react"
import { skeletonBounds, type BoardTemplate } from "@/lib/board/templates"
import type { PreviewShapes } from "@/lib/board/previewShapes"
import { ShapesPreview } from "@/components/board/shapesPreview"

export function templateShapes(t: BoardTemplate): PreviewShapes {
  const sk = t.build("preview")
  const b = skeletonBounds(sk)
  const notes = sk.flatMap((s) =>
    s.type === "rectangle" ? [{ x: s.x - b.x, y: s.y - b.y, w: s.width, h: s.height, colour: s.customData.colour }] : [],
  )
  const labels = sk.flatMap((s) => (s.type === "text" ? [{ x: s.x - b.x, y: s.y - b.y, w: s.text.length * s.fontSize * 0.55, h: s.fontSize }] : []))
  const lines = sk.flatMap((s) => (s.type === "arrow" ? [{ x1: s.x - b.x, y1: s.y - b.y, x2: s.x + s.width - b.x, y2: s.y + s.height - b.y }] : []))
  return { notes, labels, lines, boxes: [], frames: [], width: b.width, height: b.height }
}

export function TemplatePreview({
  template,
  height = 96,
  className,
  pad = 14,
}: {
  template: BoardTemplate
  height?: number
  className?: string
  pad?: number
}) {
  const shapes = React.useMemo(() => templateShapes(template), [template])
  return <ShapesPreview shapes={shapes} id={template.id} height={height} className={className} pad={pad} />
}
