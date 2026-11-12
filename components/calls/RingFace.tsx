import type { ReactNode } from "react"

/** The still moss ring of a face a call rings, drawn on the face's own circle. */
export const RING_ON = "ring-2 ring-camp-moss"

/**
 * A face a call rings (slack-06 H2), on the callee's card, its drawer and the
 * caller's stage: its children (the face, wearing RING_ON while it rings, and
 * a mark at its corner) over a moss ring that pulses out while it rings aloud
 * (none under reduced motion: globals.css).
 */
export function RingFace({ children, pulse, size }: { children: ReactNode; pulse: boolean; size: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {pulse && <span aria-hidden="true" className="ring-pulse absolute inset-0 rounded-full ring-2 ring-camp-moss" />}
      {children}
    </span>
  )
}
