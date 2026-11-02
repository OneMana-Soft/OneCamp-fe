"use client"

/**
 * Reactions that rise and fade (W3-B, miro-24): one queue and one rising mark for every surface that shows the
 * shared set (lib/reactions/set). A call floats them up its stage's edge (components/livekit/callReactions); a
 * board raises each from under its sender's face, the point it gives as `from`. UI only: nothing is kept.
 */

import * as React from "react"
import type { Reaction } from "@/lib/reactions/set"
import { REACTION_NAMES } from "@/lib/reactions/names"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { cn } from "@/lib/utils/helpers/cn"

/** Where a reaction rises from, in its list's own frame: its middle starts at x, its top at y. */
export interface RisePoint {
  x: number
  y: number
}

export interface FloatingReaction {
  id: number
  emoji: Reaction
  name: string
  mine: boolean
  /** Without one, it rises in its list's flow. */
  from?: RisePoint
}

/** How long one floats. */
export const REACTION_FLOAT_MS = 3200
/** At most this many at once: a burst from everyone stays a burst. */
const MAX_SHOWN = 8
/** One person's reactions closer together than this count once. */
const SAME_PERSON_MS = 250

/**
 * The reactions shown now, and add(), which says false when the same person (`who`, a stable id) sent one too soon.
 * Each goes after REACTION_FLOAT_MS; the timers end with the component.
 */
export function useReactionQueue() {
  const [shown, setShown] = React.useState<FloatingReaction[]>([])
  const seq = React.useRef(0)
  const lastBy = React.useRef(new Map<string, number>())
  const timers = React.useRef(new Set<number>())

  const add = React.useCallback((emoji: Reaction, who: string, name: string, mine: boolean, from?: RisePoint): boolean => {
    const t = Date.now()
    if (t - (lastBy.current.get(who) ?? -Infinity) < SAME_PERSON_MS) return false
    lastBy.current.set(who, t)
    const id = ++seq.current
    const r: FloatingReaction = from ? { id, emoji, name, mine, from } : { id, emoji, name, mine }
    setShown((list) => [...list, r].slice(-MAX_SHOWN))
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setShown((list) => list.filter((x) => x.id !== id))
    }, REACTION_FLOAT_MS)
    timers.current.add(timer)
    return true
  }, [])

  React.useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  return { shown, add }
}

/**
 * One reaction rising and fading; with reduced motion it only fades. With a point it stands there, centred on its x
 * (the centring is the translate property, so the rise's transform keeps it), in its list's positioned frame.
 */
export function Rising({ r }: { r: FloatingReaction }) {
  const ref = React.useCallback((el: HTMLLIElement | null) => {
    if (!el || typeof el.animate !== "function") return
    const still = prefersReducedMotion()
    el.animate(
      still
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: "translateY(12px) scale(0.8)" },
            { opacity: 1, transform: "translateY(0) scale(1)", offset: 0.12 },
            { opacity: 1, transform: "translateY(-56px) scale(1)", offset: 0.75 },
            { opacity: 0, transform: "translateY(-80px) scale(0.96)" },
          ],
      { duration: REACTION_FLOAT_MS, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" },
    )
  }, [])
  return (
    <li
      ref={ref}
      className={cn("flex items-center gap-1.5", r.from && "absolute -translate-x-1/2")}
      style={r.from ? { left: r.from.x, top: r.from.y } : undefined}
      data-reaction={r.mine ? "mine" : ""}
    >
      <span aria-hidden className="text-3xl leading-none drop-shadow-[0_2px_6px_rgb(0_0_0/0.35)]">
        {r.emoji}
      </span>
      <span aria-hidden className="rounded-[8px] bg-[#1F2024]/90 px-1.5 py-0.5 text-micro font-medium text-[#EEEEF0]">
        {r.name}
      </span>
      <span className="sr-only">{`${r.name} reacted: ${REACTION_NAMES[r.emoji]}`}</span>
    </li>
  )
}
