"use client"

// A board template drawn small, from its real layout (content.md B02): the
// same skeleton the template inserts (lib/board/templates), scaled into a box
// on the dot grid, each note in its camp tint. A retro reads as three columns
// of moss, berry and sky notes, a brainstorm as a cluster round a centre
// note, a SWOT as a 2 × 2. On hover (the card is a `group/tpl`) the notes
// drift a degree or two, a small "alive" moment; never under reduced motion.

import * as React from "react"
import { STICKY_COLOURS, skeletonBounds, type BoardTemplate, type StickyColour } from "@/lib/board/templates"
import { cn } from "@/lib/utils/helpers/cn"

/** A note's paper, as the theme's token, from the colour the template stores. */
const TINT: Record<StickyColour, string> = {
  yellow: "var(--camp-sun-tint)",
  green: "var(--camp-moss-tint)",
  red: "var(--camp-berry-tint)",
  blue: "var(--camp-sky-tint)",
  purple: "var(--camp-dusk-tint)",
  grey: "var(--sunken)",
}
const BY_FILL = new Map(Object.entries(STICKY_COLOURS).map(([k, v]) => [v.fill.toLowerCase(), k as StickyColour]))

/** Small, fixed drifts per note, so a hover moves each a little differently. */
const DRIFT = [
  [1, -1, -2],
  [-1, 1, 2],
  [1, 1, 1.5],
  [-1, -1, -1.5],
  [0, -2, 2],
  [2, 0, -1],
]

export function templateShapes(t: BoardTemplate) {
  const sk = t.build("preview")
  const b = skeletonBounds(sk)
  const notes = sk.flatMap((s) =>
    s.type === "rectangle" ? [{ x: s.x - b.x, y: s.y - b.y, w: s.width, h: s.height, colour: BY_FILL.get(s.backgroundColor.toLowerCase()) ?? "grey" }] : [],
  )
  const labels = sk.flatMap((s) => (s.type === "text" ? [{ x: s.x - b.x, y: s.y - b.y, w: s.text.length * s.fontSize * 0.55, h: s.fontSize }] : []))
  return { notes, labels, width: b.width, height: b.height }
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
  // A fixed 16:10-ish viewBox; the drawing fits inside with padding.
  const vw = 200
  const vh = Math.round((vw * height) / 180)
  const scale = Math.min((vw - pad * 2) / shapes.width, (vh - pad * 2) / shapes.height)
  const ox = (vw - shapes.width * scale) / 2
  const oy = (vh - shapes.height * scale) / 2
  return (
    <div className={cn("dot-ground relative w-full overflow-hidden", className)} style={{ height }} aria-hidden="true" data-template-preview={template.id}>
      <svg viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full">
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

/**
 * The fallback for a board with no picture yet (B01): three tilted sticky
 * notes in sun, sky and berry on the dot grid, so it reads as a board and not
 * as an error.
 */
export function NotesFallback({ className }: { className?: string }) {
  const notes = [
    { tint: "var(--camp-sun-tint)", rot: -4, x: -46, y: -4 },
    { tint: "var(--camp-sky-tint)", rot: 2, x: 0, y: 10 },
    { tint: "var(--camp-berry-tint)", rot: 6, x: 44, y: -10 },
  ]
  return (
    <div data-note-fallback="" aria-hidden="true" className={cn("absolute inset-0 flex items-center justify-center", className)}>
      {notes.map((n, i) => (
        <span
          key={i}
          className="absolute size-9 rounded-[4px] p-1.5 shadow-e1"
          style={{ background: n.tint, transform: `translate(${n.x}px, ${n.y}px) rotate(${n.rot}deg)` }}
        >
          <span className="block h-[3px] w-5 rounded-[2px] bg-ink-4" />
          <span className="mt-1 block h-[3px] w-3 rounded-[2px] bg-ink-4" />
        </span>
      ))}
    </div>
  )
}
