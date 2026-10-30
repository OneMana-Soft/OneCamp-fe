/**
 * A series as a 32 px line (work.md W44): 1.5 px with a dot at its end; no
 * axis. Ink-2, or the colour of what it counts (a doc's views in the docs
 * area's hue). A report's weekly figures and a doc's daily views draw it.
 * Fewer than two values have nothing to draw.
 */
export function Sparkline({ values, className, color = "var(--ink-2)" }: { values: number[]; className?: string; color?: string }) {
  if (values.length < 2) return null
  const hi = Math.max(1, ...values)
  const W = 120
  const H = 32
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - (v / hi) * (H - 6)] as const)
  const [ex, ey] = pts[pts.length - 1]
  return (
    <svg data-spark="" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className ?? "mt-2 block h-8 w-full max-w-[160px] overflow-visible"} aria-hidden="true">
      <path d={pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ex} cy={ey} r={2} fill={color} />
    </svg>
  )
}
