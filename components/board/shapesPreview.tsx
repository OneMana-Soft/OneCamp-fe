"use client"

// A board drawn small (content.md B02): its notes in their camp tints, its
// frames, its other shapes as outlines, its words as bars and its arrows,
// scaled into a box on the dot grid. A retro reads as three columns of moss,
// berry and sky notes, a brainstorm as a cluster round a centre note. On
// hover (the card is a `group/tpl`) the notes drift a degree or two, a small
// "alive" moment; never under reduced motion. A built-in template's shapes
// come from its skeleton (components/board/templatePreview), a team's from
// the server's drawing of it (lib/board/teamTemplates).

import * as React from "react"
import type { NoteColourId } from "@/lib/board/notes"
import type { PreviewShapes } from "@/lib/board/previewShapes"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A note's paper, as the theme's token, from the colour the template gives
 * it: each of the sixteen to its nearest camp tint, so a preview follows the
 * theme (dark included).
 */
const TINT: Record<NoteColourId, string> = {
  yellow: "var(--camp-sun-tint)",
  cream: "var(--camp-sun-tint)",
  orange: "var(--camp-sun-tint)",
  green: "var(--camp-moss-tint)",
  mint: "var(--camp-moss-tint)",
  forest: "var(--camp-moss-tint)",
  red: "var(--camp-berry-tint)",
  blush: "var(--camp-berry-tint)",
  tomato: "var(--camp-berry-tint)",
  blue: "var(--camp-sky-tint)",
  ice: "var(--camp-sky-tint)",
  navy: "var(--camp-sky-tint)",
  teal: "var(--camp-lake-tint)",
  purple: "var(--camp-dusk-tint)",
  grey: "var(--sunken)",
  charcoal: "var(--sunken)",
}

/** A note colour's paper as the theme's token, for small drawings of a board. */
export function noteTint(colour: NoteColourId | null | undefined): string {
  return colour ? TINT[colour] : "var(--sunken)"
}

/** Small, fixed drifts per note, so a hover moves each a little differently. */
const DRIFT = [
  [1, -1, -2],
  [-1, 1, 2],
  [1, 1, 1.5],
  [-1, -1, -1.5],
  [0, -2, 2],
  [2, 0, -1],
]

export function ShapesPreview({
  shapes,
  id,
  height = 96,
  className,
  pad = 14,
}: {
  shapes: PreviewShapes
  /** What the drawing is of, on data-template-preview. */
  id: string
  height?: number
  className?: string
  pad?: number
}) {
  // The viewBox is the drawing's own shape, padded, and the svg meets its box,
  // so the drawing fills the box's tighter side whatever the box is: a list's
  // tile or the picker's whole pane, where a viewBox shaped for a tile left a
  // retro as a few specks in the middle (DESIGN-BUILD-7, 23 Oct).
  const vw = 200
  const scale = (vw - pad * 2) / Math.max(1, shapes.width)
  const vh = Math.round(shapes.height * scale + pad * 2)
  const ox = pad
  const oy = pad
  return (
    <div className={cn("dot-ground relative w-full overflow-hidden", className)} style={{ height }} aria-hidden="true" data-template-preview={id}>
      <svg viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full">
        {shapes.frames.map((f, i) => (
          <rect key={`f${i}`} x={ox + f.x * scale} y={oy + f.y * scale} width={f.w * scale} height={f.h * scale} rx={2} fill="var(--sheet)" fillOpacity={0.6} stroke="var(--line-2)" strokeWidth={0.75} />
        ))}
        {shapes.boxes.map((b, i) =>
          b.round ? (
            <ellipse key={`b${i}`} cx={ox + (b.x + b.w / 2) * scale} cy={oy + (b.y + b.h / 2) * scale} rx={(b.w * scale) / 2} ry={(b.h * scale) / 2} fill="none" stroke="var(--ink-4)" strokeWidth={0.75} />
          ) : (
            <rect key={`b${i}`} x={ox + b.x * scale} y={oy + b.y * scale} width={b.w * scale} height={b.h * scale} rx={1.5} fill="none" stroke="var(--ink-4)" strokeWidth={0.75} />
          ),
        )}
        {shapes.lines.map((l, i) => (
          <line key={`a${i}`} x1={ox + l.x1 * scale} y1={oy + l.y1 * scale} x2={ox + l.x2 * scale} y2={oy + l.y2 * scale} stroke="var(--ink-4)" strokeWidth={1} strokeLinecap="round" />
        ))}
        {shapes.labels.map((l, i) => (
          <rect key={`l${i}`} x={ox + l.x * scale} y={oy + l.y * scale + (l.h * scale) / 4} width={Math.max(6, l.w * scale * 0.7)} height={Math.max(2, (l.h * scale) / 2)} rx={1} fill="var(--ink-4)" />
        ))}
        {shapes.notes.map((n, i) => {
          const [dx, dy, rot] = DRIFT[i % DRIFT.length]
          const x = ox + n.x * scale
          const y = oy + n.y * scale
          const w = n.w * scale
          const h = n.h * scale
          return (
            <g
              key={i}
              className="origin-center transition-transform duration-[400ms] ease-[var(--ease-spring)] [transform-box:fill-box] group-hover/tpl:[transform:translate(var(--dx),var(--dy))_rotate(var(--rot))] motion-reduce:group-hover/tpl:transform-none"
              style={{ ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px`, ["--rot" as string]: `${rot}deg` }}
            >
              <rect x={x} y={y + 0.8} width={w} height={h} rx={Math.min(3, w / 8)} fill="var(--ink)" opacity={0.06} />
              <rect x={x} y={y} width={w} height={h} rx={Math.min(3, w / 8)} fill={TINT[n.colour]} stroke="var(--line-2)" strokeWidth={0.5} />
              {w > 14 ? (
                <>
                  <rect x={x + w * 0.16} y={y + h * 0.24} width={w * 0.6} height={Math.max(1.2, h * 0.07)} rx={0.6} fill="var(--ink-4)" />
                  <rect x={x + w * 0.16} y={y + h * 0.4} width={w * 0.4} height={Math.max(1.2, h * 0.07)} rx={0.6} fill="var(--ink-4)" />
                </>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
