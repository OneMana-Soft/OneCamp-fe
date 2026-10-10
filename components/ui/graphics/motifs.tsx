import type { CampHue } from "@/lib/campHue"

import { HUE_CLASS, cx } from "./hues"

/**
 * The graphic language of the playful layer: the ring from the logo, extended.
 * Concentric rings, a dotted orbit with hued dots, an arc, a four-point spark.
 * Geometric and flat: thin lines at 1.5px, or the logo's own thick ring.
 *
 * Every one is inline SVG, decorative (aria-hidden), and drawn in either a
 * camp hue (hue="sky": the strong cut) or currentColor when given none, so it
 * sits quietly in whatever text colour surrounds it. No image files.
 *
 * The same file lives in the storefront (onemana-frontend).
 */
export interface MotifProps {
  /** In px; the motif scales, its thin lines do not. */
  size?: number
  /** Draw in this camp hue's strong cut; currentColor without one. */
  hue?: CampHue
  className?: string
}

/** The logo's ring proportions: the stroke is a third of the radius. */
const CORE_R = 12
const CORE_W = 4

/** The four-point spark, in a 24 box. */
export const SPARK_PATH = "M12 2Q13.6 10.4 22 12Q13.6 13.6 12 22Q10.4 13.6 2 12Q10.4 10.4 12 2Z"

/**
 * Concentric rings fading outward from the logo's ring, like the ripple of a
 * moment. `count` thin rings (1.5px at any size) around an optional core.
 *
 *   <Rings hue="sky" size={160} />
 */
export function Rings({ size = 96, hue, className, count = 3, core = true }: MotifProps & { count?: number; core?: boolean }) {
  const n = Math.max(1, Math.min(4, Math.round(count)))
  const step = n === 1 ? 0 : 24 / (n - 1)
  const fade = [0.6, 0.38, 0.22, 0.12]
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={cx(hue && HUE_CLASS[hue], hue ? "stroke-hue" : "stroke-current", className)}
    >
      {core && <circle cx="50" cy="50" r={CORE_R} strokeWidth={CORE_W} />}
      {Array.from({ length: n }, (_, i) => (
        <circle
          key={i}
          cx="50"
          cy="50"
          r={22 + i * step}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          opacity={fade[i]}
        />
      ))}
    </svg>
  )
}

/** Where the dots sit round the orbit: even, nudged off the clock face. */
const DOT_NUDGE = [0, 12, -8, 16, -4, 9]
const DOT_R = [4.5, 3.5, 4.2, 3.2, 4, 3.4]
const DOT_HUES: CampHue[] = ["sky", "moss", "sun", "dusk", "berry", "lake"]

/**
 * A dotted orbit with small hued dots on it: people and channels round a
 * workspace. The dots take the six hues in the chart order unless given
 * `hues`; the centre is the logo's ring in currentColor.
 *
 *   <Orbit dots={5} size={140} />
 */
export function Orbit({
  size = 120,
  hue,
  className,
  dots = 5,
  hues = DOT_HUES,
  center = true,
}: MotifProps & { dots?: number; hues?: CampHue[]; center?: boolean }) {
  const n = Math.max(0, Math.min(6, Math.round(dots)))
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      className={cx(hue && HUE_CLASS[hue], className)}
    >
      <circle
        cx="50"
        cy="50"
        r="40"
        strokeWidth="1.5"
        strokeDasharray="0 5"
        className={hue ? "stroke-hue" : "stroke-current"}
        opacity={hue ? undefined : 0.45}
      />
      {center && <circle cx="50" cy="50" r={CORE_R} strokeWidth={CORE_W} className="stroke-current" />}
      {Array.from({ length: n }, (_, i) => {
        const a = ((-100 + (i * 360) / n + DOT_NUDGE[i]) * Math.PI) / 180
        return (
          <circle
            key={i}
            cx={(50 + 40 * Math.cos(a)).toFixed(1)}
            cy={(50 + 40 * Math.sin(a)).toFixed(1)}
            r={DOT_R[i]}
            className={cx(HUE_CLASS[hues[i % hues.length]], "fill-hue")}
          />
        )
      })}
    </svg>
  )
}

/**
 * A partial ring, with round ends: `sweep` of a full turn (0 to 1) from
 * `start` degrees (0 is twelve o'clock, clockwise), `weight` in the 100-unit
 * box (8 is the logo's own). An optional faint `track` draws the rest.
 *
 *   <Arc hue="dusk" sweep={0.3} start={40} />
 */
export function Arc({
  size = 48,
  hue,
  className,
  sweep = 0.3,
  start = 0,
  weight = 8,
  track = false,
}: MotifProps & { sweep?: number; start?: number; weight?: number; track?: boolean }) {
  const r = 50 - weight / 2
  const turn = Math.max(0, Math.min(1, sweep)) * 100
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      className={cx(hue && HUE_CLASS[hue], hue ? "stroke-hue" : "stroke-current", className)}
    >
      {track && <circle cx="50" cy="50" r={r} strokeWidth={weight} opacity="0.15" />}
      <circle
        cx="50"
        cy="50"
        r={r}
        strokeWidth={weight}
        pathLength={100}
        strokeDasharray={`${turn} 100`}
        transform={`rotate(${start - 90} 50 50)`}
      />
    </svg>
  )
}

/**
 * The four-point spark: a glint for a moment worth it, or an accent in a
 * composition. Filled in the hue's strong cut, or currentColor.
 *
 *   <Spark hue="sun" size={12} />
 */
export function Spark({ size = 12, hue, className }: MotifProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={cx(hue && HUE_CLASS[hue], hue ? "fill-hue" : "fill-current", className)}
    >
      <path d={SPARK_PATH} />
    </svg>
  )
}
