"use client"

import * as React from "react"
import Link from "next/link"

import { cn } from "@/lib/utils/helpers/cn"

// A scatter of things against time, with the lines a reader measures them by
// (a median, an 85th percentile) and the band between two more (the 25th to
// the 95th): a control chart (B9-a). Its own chunk, loaded with the section
// that draws it: SvgChart's charts are categories on an axis, and this one's
// x is a date. It needs no measuring: x is a share of the width and y is in
// pixels, so a circle stays round at any width and the labels keep their size.

export interface ScatterPoint {
  id: string
  /** Where on the x axis, in the domain's units (a time in ms, most often). */
  x: number
  y: number
  label: string
  /** The line under the label in the point's tip. */
  detail: string
  /** Where the tip's link goes; none for no link. */
  href?: string
  /** Drawn faint, behind the others: out of the slice being looked at. */
  muted?: boolean
}

export interface ScatterGuide {
  y: number
  label: string
  dashed?: boolean
}

export interface ScatterChartProps {
  title: string
  subtitle?: string
  points: ScatterPoint[]
  /** Lines across the plot, each in the legend. */
  guides?: ScatterGuide[]
  /** A shaded band between two values, in the legend. */
  band?: { from: number; to: number; label: string }
  xDomain: [number, number]
  xTicks: { at: number; label: string }[]
  yFormat: (v: number) => string
  /** What the figure says to a screen reader. */
  summary: string
  empty: string
  /** The points' and guides' colour, a CSS colour. */
  color?: string
  /** The words of a tip's link. */
  linkLabel?: string
  /** Words beside the title (a toggle, most often). */
  actions?: React.ReactNode
  className?: string
}

const H = 220
const PAD_Y = 10

/** The smallest of 1, 2, 2.5 or 5 times a power of ten at or above v. */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v - 1e-9) ?? 10) * p
}

export function ScatterChart({ title, subtitle, points, guides = [], band, xDomain, xTicks, yFormat, summary, empty, color = "var(--camp-sky)", linkLabel = "Open", actions, className }: ScatterChartProps) {
  const [tip, setTip] = React.useState<ScatterPoint | null>(null)
  const top = niceCeil(Math.max(0, ...points.map((p) => p.y), ...guides.map((g) => g.y), band?.to ?? 0))
  const yPx = (v: number) => PAD_Y + (H - 2 * PAD_Y) * (1 - Math.min(v, top) / top)
  const [x0, x1] = xDomain
  // A 3% margin each side, so a point on the first or last day isn't cut in half.
  const xPct = (x: number) => 3 + (94 * (x - x0)) / Math.max(x1 - x0, 1)
  const ticks = [0, top / 2, top]
  const drawn = [...points.filter((p) => p.muted), ...points.filter((p) => !p.muted)]
  return (
    <figure
      data-scatter-chart=""
      // A tip open is this chart's to put away: Escape here closes it first (lib/keys/escapeGuard).
      data-escape-own={tip ? "" : undefined}
      className={cn("relative my-0 w-full rounded-lg bg-raised px-5 pb-3 pt-4 shadow-e1", className)}
      onMouseLeave={() => setTip(null)}
      onKeyDown={(e) => e.key === "Escape" && setTip(null)}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <figcaption className="text-sm font-[590] text-foreground">{title}</figcaption>
          {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {points.length === 0 ? (
        <p data-chart-empty="" className="py-6 text-sm text-ink-2">
          {empty}
        </p>
      ) : (
        <>
          <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2" aria-hidden>
            {guides.map((g) => (
              <li key={g.label} className="flex items-center gap-1.5">
                <svg width="14" height="2" className="shrink-0">
                  <line x1="0" x2="14" y1="1" y2="1" stroke={color} strokeWidth={2} strokeDasharray={g.dashed ? "3 2" : undefined} />
                </svg>
                {g.label}
              </li>
            ))}
            {band && (
              <li className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color, opacity: 0.18 }} />
                {band.label}
              </li>
            )}
          </ul>
          <div className="flex gap-2">
            <div className="relative w-10 shrink-0 text-right text-3xs tabular-nums text-ink-3" style={{ height: H }} aria-hidden>
              {ticks.map((t) => (
                <span key={t} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: yPx(t) }}>
                  {yFormat(t)}
                </span>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              <svg width="100%" height={H} role="img" aria-label={summary} className="block overflow-visible">
                {ticks.map((t) => (
                  <line key={t} x1="0" x2="100%" y1={yPx(t)} y2={yPx(t)} stroke={t === 0 ? "var(--line-3)" : "var(--line)"} strokeWidth={1} shapeRendering="crispEdges" />
                ))}
                {band && <rect data-scatter-band="" x="0" width="100%" y={yPx(band.to)} height={Math.max(0, yPx(band.from) - yPx(band.to))} fill={color} fillOpacity={0.1} />}
                {guides.map((g) => (
                  <line key={g.label} data-scatter-guide="" x1="0" x2="100%" y1={yPx(g.y)} y2={yPx(g.y)} stroke={color} strokeWidth={1.5} strokeDasharray={g.dashed ? "5 4" : undefined} />
                ))}
                {drawn.map((p) => (
                  <g key={p.id} data-scatter-point={p.muted ? "muted" : ""}>
                    <circle cx={`${xPct(p.x)}%`} cy={yPx(p.y)} r={tip?.id === p.id ? 5 : 3.5} fill={color} fillOpacity={p.muted ? 0.16 : 0.75} stroke={tip?.id === p.id ? "var(--foreground)" : "none"} />
                    {/* A finger-sized target round each dot. */}
                    <circle cx={`${xPct(p.x)}%`} cy={yPx(p.y)} r={11} fill="transparent" onPointerEnter={(e) => e.pointerType === "mouse" && setTip(p)} onClick={() => setTip(p)} />
                  </g>
                ))}
              </svg>
              <div className="relative mt-1 h-4 text-3xs text-ink-3" aria-hidden>
                {xTicks.map((t) => (
                  <span key={t.at} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${xPct(t.at)}%` }}>
                    {t.label}
                  </span>
                ))}
              </div>
              {tip && <Tip point={tip} left={xPct(tip.x)} top={yPx(tip.y)} linkLabel={linkLabel} />}
            </div>
          </div>
        </>
      )}
    </figure>
  )
}

/** A point's tip: what it is, its numbers, and a link to it. */
function Tip({ point, left, top, linkLabel }: { point: ScatterPoint; left: number; top: number; linkLabel: string }) {
  return (
    <div
      role="tooltip"
      data-chart-tip=""
      className="absolute z-10 w-max max-w-60 rounded-[10px] bg-pop px-2.5 py-2 text-xs shadow-e3"
      style={{ left: `${left}%`, top, marginTop: -10, transform: `translate(${left > 70 ? "-100%" : left < 30 ? "0" : "-50%"}, -100%)` }}
    >
      <p className="truncate font-[510] text-foreground">{point.label}</p>
      <p className="mt-0.5 tabular-nums text-ink-2">{point.detail}</p>
      {point.href && (
        <Link href={point.href} className="mt-1 inline-block font-[510] text-primary underline-offset-2 hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  )
}
