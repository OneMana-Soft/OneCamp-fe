import { cn } from "@/lib/utils/helpers/cn"

/**
 * The shell's two spots (design v3, shell §L3 and §L4, mock M6), drawn from
 * the playful layer's motif with the camp tokens, so they theme in both modes.
 * Decorative: the words beside them say what happened.
 */

/** The crash spot: the logo ring, broken. A sun-tint disc and two arcs with a gap. */
export function SpotCrash({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true" data-spot="" data-spot-crash="" className={cn("spot-in", className)}>
      <circle cx="48" cy="48" r="36" className="fill-camp-sun-tint" />
      <circle cx="48" cy="48" r="20" className="stroke-camp-sun" strokeWidth="7" strokeDasharray="80 200" strokeLinecap="round" transform="rotate(30 48 48)" />
      <circle cx="48" cy="48" r="20" className="stroke-camp-sun" strokeWidth="7" strokeDasharray="30 200" strokeDashoffset="-100" strokeLinecap="round" transform="rotate(30 48 48)" opacity=".45" />
    </svg>
  )
}

/**
 * The 404's orbit spot: a ring, a dashed orbit, a sky disc with a compass, a
 * berry and a sun dot that orbit once and stop, and one brand spark.
 */
export function SpotOrbit({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true" data-spot="" data-spot-orbit="" className={cn("spot-in", className)}>
      <circle cx="48" cy="48" r="44" style={{ stroke: "var(--line-2)" }} />
      <circle cx="48" cy="48" r="32" style={{ stroke: "var(--line-3)" }} strokeDasharray="1.5 5" strokeLinecap="round" />
      <circle cx="48" cy="48" r="22" className="fill-camp-sky-tint" />
      <path d="M40 56l4-12 12-4-4 12z" style={{ fill: "var(--raised)" }} className="stroke-camp-sky" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="48" cy="48" r="2.2" className="fill-camp-sky" />
      <g className="orbit-once">
        <circle cx="84" cy="40" r="3.5" className="fill-camp-berry" />
        <circle cx="14" cy="62" r="3" className="fill-camp-sun" />
      </g>
      <path className="spark-in" d="M76 12c.4 3.4 2.1 5.1 7 7-4.9 1.9-6.6 3.6-7 7-.4-3.4-2.1-5.1-7-7 4.9-1.9 6.6-3.6 7-7z" style={{ fill: "var(--brand)" }} />
    </svg>
  )
}

/** The panel's spot: the crash spot at 56px. */
export function SpotPanelCrash({ className }: { className?: string }) {
  return <SpotCrash size={56} className={className} />
}
