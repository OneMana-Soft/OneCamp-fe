"use client"

// The camp: the signed-out pages' and the first run's art (design v3,
// admin.md F1 and E1; DESIGN_V3 §3.15). A canvas of paper with the theme's
// ember glow, a dusk and a lake corner light and 2% grain; on it the logo's
// gradient ring with orbits round it, and on the orbits anonymous people (a
// gradient disc, never initials or a name: nothing on a customer's sign-in
// page pretends to be one of their members, owner decision D2) and one agent
// square. Decorative throughout: the words beside it say everything. The
// heroes beside a form (sign-in, sign-up, the first run) are CampHeroes', so
// a page without one doesn't carry them.

import * as React from "react"
import { useEffect, useId, useState } from "react"
import { type CampHue } from "@/lib/campHue"
import { HUE_CLASS, cx } from "@/components/ui/graphics"

/** The logo's gradient (the shell's mark draws the same two stops). */
const LOGO_FROM = "#FF8A00"
const LOGO_TO = "#FF3D00"

/** Whether the person asked for less motion. Read once on mount. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    try {
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    } catch {
      setReduced(false)
    }
  }, [])
  return reduced
}

/** The logo's ring in its gradient: `size` px across, the stroke a sixth of it. */
export function GradientRing({ size = 24, className, grey = false, stroke }: { size?: number; className?: string; grey?: boolean; stroke?: number }) {
  // The stroke in px at the drawn size; the logo's own proportion (a sixth) when not given.
  const width = stroke ? (stroke * 24) / size : 4
  const r = 10 - width / 2
  const id = useId().replace(/:/g, "")
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className} data-gradient-ring="">
      {!grey && (
        <defs>
          <linearGradient id={`lg${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={LOGO_FROM} />
            <stop offset="1" stopColor={LOGO_TO} />
          </linearGradient>
        </defs>
      )}
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth={width} stroke={grey ? "var(--line-3)" : `url(#lg${id})`} />
    </svg>
  )
}

/**
 * The canvas itself. `panel` is the hero's inset r24 panel; `soft` is half
 * strength with no rings (a centred page's top band, the consent card's
 * glow); `lit` steps the ember up (the first run's ignition).
 */
export function CampCanvas({
  children,
  className,
  panel,
  soft,
  lit,
  instant,
  preview,
  style,
}: {
  children?: React.ReactNode
  className?: string
  panel?: boolean
  soft?: boolean
  lit?: boolean
  instant?: boolean
  /** A key that changes as a previewed theme changes, to fade the glow in again. */
  preview?: string | null
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cx("auth-camp", className)}
      data-camp=""
      data-panel={panel ? "" : undefined}
      data-soft={soft ? "" : undefined}
      data-lit={lit ? "" : undefined}
      data-instant={instant ? "" : undefined}
      data-preview={preview ? "" : undefined}
      aria-hidden="true"
      style={style}
    >
      <div key={preview ?? "glow"} className="auth-camp-layer auth-camp-ember" />
      <div className="auth-camp-layer auth-camp-dusk" />
      {!soft && <div className="auth-camp-layer auth-camp-grain" />}
      {children}
    </div>
  )
}

/** A person with no name: the hue's avatar gradient on a 2.5px surface ring. Never initials. */
export function AnonAvatar({ hue, r = 18 }: { hue: CampHue; r?: number }) {
  return (
    <g className={HUE_CLASS[hue]} data-anon-avatar="">
      <circle r={r + 2.5} fill="var(--sheet)" />
      <circle r={r} fill="var(--hue-a2)" />
      <circle r={r} fill="var(--hue-a1)" opacity=".6" />
    </g>
  )
}

/** The workspace's address, as this page is on it. Empty until mounted (server render). */
export function useHost(): string {
  const [host, setHost] = useState("")
  useEffect(() => setHost(window.location.host), [])
  return host
}

/**
 * The phone's canvas band: the camp in a strip at the top of the page, the
 * ring and one orbit with two people. Height and ring size per page (160 / 56
 * on sign-in, 200 / 64 on the first run).
 */
export function CampBand({
  height = 160,
  ring = 56,
  people = 2,
  grey = false,
  lit,
  instant,
  className,
}: {
  height?: number
  ring?: number
  people?: number
  grey?: boolean
  lit?: boolean
  instant?: boolean
  className?: string
}) {
  const r = ring * 1.3
  const hues: CampHue[] = ["sky", "berry", "moss", "dusk"]
  return (
    <CampCanvas className={cx("auth-band", className)} lit={lit} instant={instant} style={{ height }}>
      <svg width={r * 2 + 40} height={height} viewBox={`${-r - 20} ${-height / 2} ${r * 2 + 40} ${height}`} aria-hidden="true">
        <circle className={grey ? "auth-orbit-empty" : "auth-orbit"} r={r} fill="none" strokeWidth="1.5" strokeDasharray={grey ? "1.5 5" : undefined} strokeLinecap="round" />
        <g transform={`translate(${-ring / 2} ${-ring / 2})`}>
          <GradientRing size={ring} grey={grey} />
        </g>
        {grey && (
          <g transform={`translate(${-ring / 2} ${-ring / 2})`} className="auth-ignite" style={{ transformOrigin: `${ring / 2}px ${ring / 2}px` }}>
            <GradientRing size={ring} />
          </g>
        )}
        {!grey &&
          Array.from({ length: Math.min(people, hues.length) }, (_, i) => {
            const a = ((-25 + i * 180) * Math.PI) / 180
            return (
              <g key={i} transform={`translate(${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)})`}>
                <g className="auth-pop" style={{ "--i": i } as React.CSSProperties}>
                  <AnonAvatar hue={hues[i]} r={12} />
                </g>
              </g>
            )
          })}
      </svg>
    </CampCanvas>
  )
}
