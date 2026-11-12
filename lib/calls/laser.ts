// A laser's stroke, wherever one is drawn and seen (miro-28, miro-10): over a call's shared screen
// (components/livekit/callInk), its sizes, how it fades and the line it's drawn on; and on a board, where everyone
// sees everyone's on Excalidraw's own trail (components/board/boardPresence), how often one held goes out and how
// long a still one lasts. No LiveKit and no board import.

import * as React from "react"
import { prefersReducedMotion } from "../reducedMotion"

/** Points in one packet. */
export const INK_CHUNK = 64
/** Points in one stroke. */
export const INK_STROKE_MAX = 2000
/** How long a laser stroke stays once it ends. */
export const LASER_MS = 1500
/** How often a stroke being drawn goes out: often enough to watch it drawn. */
export const INK_SEND_MS = 50

/**
 * A stroke's x, y pairs with `p` written from point `at` on, at most INK_STROKE_MAX points: a chunk written twice
 * changes nothing, and one past the end joins on. Pure.
 */
export function writePoints(points: readonly number[], at: number, p: readonly number[]): number[] {
  return points.slice(0, Math.min(at * 2, points.length)).concat(p).slice(0, INK_STROKE_MAX * 2)
}

const tenth = (v: number) => Math.round(v * 10) / 10

/**
 * x, y pairs as an SVG path, to a tenth: smoothed through the middles of its segments, and a tap drawn as a dot (a
 * segment of no length, with round caps). Pure.
 */
export function trailPath(xy: readonly number[]): string {
  const n = Math.floor(xy.length / 2)
  if (n === 0) return ""
  const x = (i: number) => tenth(xy[i * 2])
  const y = (i: number) => tenth(xy[i * 2 + 1])
  if (n === 1) return `M${x(0)} ${y(0)}L${x(0)} ${y(0)}`
  if (n === 2) return `M${x(0)} ${y(0)}L${x(1)} ${y(1)}`
  let d = `M${x(0)} ${y(0)}`
  for (let i = 1; i < n - 1; i++) d += `Q${x(i)} ${y(i)} ${tenth((x(i) + x(i + 1)) / 2)} ${tenth((y(i) + y(i + 1)) / 2)}`
  return `${d}L${x(n - 1)} ${y(n - 1)}`
}

/**
 * A stroke's look as it fades: a laser's fades out over LASER_MS from the moment it ends; with reduced motion it
 * stays whole, and goes at once when its time is up (laserTimers). Nothing for what isn't a laser.
 */
export function useLaserFade(laser: boolean, done: boolean): React.CSSProperties | undefined {
  const [fading, setFading] = React.useState(false)
  React.useEffect(() => {
    if (!laser || !done || prefersReducedMotion()) return
    const raf = window.requestAnimationFrame(() => setFading(true))
    return () => window.cancelAnimationFrame(raf)
  }, [laser, done])
  return laser ? { opacity: fading ? 0 : 1, transition: `opacity ${LASER_MS}ms ease-in` } : undefined
}

/** Timers for laser strokes, LASER_MS each unless told: each gives back its cancel, and stop() cancels them all. */
export function laserTimers() {
  const pending = new Set<number>()
  return {
    later(fn: () => void, ms = LASER_MS): () => void {
      const t = window.setTimeout(() => {
        pending.delete(t)
        fn()
      }, ms)
      pending.add(t)
      return () => {
        window.clearTimeout(t)
        pending.delete(t)
      }
    },
    stop() {
      pending.forEach((t) => window.clearTimeout(t))
      pending.clear()
    },
  }
}
