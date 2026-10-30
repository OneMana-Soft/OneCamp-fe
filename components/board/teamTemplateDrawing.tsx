"use client"

// A team's board template drawn small, from the server's drawing of it
// (lib/board/teamTemplates), and, asked, how much is on it. The Templates page
// loads it after its cards, so the page's first load doesn't bring a board's
// drawing code.

import * as React from "react"
import { ShapesPreview } from "@/components/board/shapesPreview"
import { listedBoard, listedShapes } from "@/lib/board/teamTemplates"

export default function TeamTemplateDrawing({
  template,
  height,
  pad,
  className,
  count = false,
}: {
  template: { id: string; name: string; payload: string }
  height: number
  pad?: number
  className?: string
  /** Say how many things are on it, under the drawing. */
  count?: boolean
}) {
  const listed = React.useMemo(() => listedBoard(template), [template])
  const shapes = React.useMemo(() => listedShapes(listed.preview), [listed])
  return (
    <>
      <ShapesPreview shapes={shapes} id={template.id} height={height} pad={pad} className={className} />
      {count && (
        <p className="mt-2 text-ui-sm tabular-nums text-ink-3">
          {listed.count.toLocaleString()} {listed.count === 1 ? "thing" : "things"} on it
        </p>
      )}
    </>
  )
}
