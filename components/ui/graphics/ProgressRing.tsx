import { useId, type ReactNode } from "react"

import { cx } from "./hues"

export interface ProgressRingProps {
  /** 0 to 100. */
  value: number
  /** In px. */
  size?: number
  /** The ring's thickness, in px. */
  weight?: number
  /** What is progressing, for assistive tech ("Q4 launch, 7 of 12 done"). */
  label: string
  /** Shown in the middle, such as the percentage. */
  children?: ReactNode
  className?: string
}

/**
 * A progress ring that fills with the theme's progress stops (the playful
 * layer, "Motion"): the logo's gradient in the house theme, the chosen accent
 * in any other (--progress-from and --progress-to, app/themes.css). Where no
 * theme sets them (the storefront), the logo's gradient is the fallback.
 *
 * The track is the surrounding text colour at low opacity, so the ring sits in
 * any surface. The value is also stated to assistive tech, and should be
 * stated in words nearby or in the middle: a ring alone never carries it.
 *
 *   <ProgressRing value={58} label="Q4 launch, 7 of 12 done">58%</ProgressRing>
 */
export function ProgressRing({ value, size = 32, weight = 3, label, children, className }: ProgressRingProps) {
  const id = `progress-${useId().replace(/[^\w-]/g, "")}`
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const r = (size - weight) / 2
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={cx("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden="true" className="absolute inset-0">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--progress-from, #FF8A00)" }} />
            <stop offset="1" style={{ stopColor: "var(--progress-to, #FF3D00)" }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={weight} className="stroke-current" opacity="0.15" />
        {v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={weight}
            stroke={`url(#${id})`}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${v} 100`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 200ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
          />
        )}
      </svg>
      {children != null && <span className="relative text-2xs font-medium tabular-nums">{children}</span>}
    </span>
  )
}
