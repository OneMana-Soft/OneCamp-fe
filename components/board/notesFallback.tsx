"use client"

// The fallback for a board with no picture yet (content.md B01): three tilted
// sticky notes on the dot grid. Apart from the template previews, so the
// boards list's first load doesn't bring the templates with it.

import * as React from "react"
import { huesFor, idHash } from "@/lib/boardHues"
import { cn } from "@/lib/utils/helpers/cn"

const NOTE_TURNS = [-6, -4, -2, 2, 4, 6]

/**
 * The three notes a fallback draws, from a seed: without one, sun, sky and
 * berry as before; with a board's id, the board's own hue first (lib/campHue,
 * as everything else a board wears) and its own tilts, so a list of boards
 * without pictures isn't one picture five times. Pure.
 */
export function fallbackNotes(seed?: string): { tint: string; rot: number; x: number; y: number }[] {
  const base = [
    { tint: "var(--camp-sun-tint)", rot: -4, x: -46, y: -4 },
    { tint: "var(--camp-sky-tint)", rot: 2, x: 0, y: 10 },
    { tint: "var(--camp-berry-tint)", rot: 6, x: 44, y: -10 },
  ]
  if (!seed?.trim()) return base
  const hues = huesFor(seed, base.length)
  const n = idHash(seed)
  return base.map((b, i) => ({
    tint: `var(--camp-${hues[i]}-tint)`,
    rot: NOTE_TURNS[(n >>> (i * 3 + 2)) % NOTE_TURNS.length],
    x: b.x,
    y: b.y + (((n >>> (i * 4 + 5)) % 7) - 3) * 2,
  }))
}

/**
 * The fallback for a board with no picture yet (B01): three tilted sticky
 * notes on the dot grid, so it reads as a board and not as an error. Given
 * the board's id, the notes take that board's own hues and tilts.
 */
export function NotesFallback({ className, seed }: { className?: string; seed?: string }) {
  const notes = fallbackNotes(seed)
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
