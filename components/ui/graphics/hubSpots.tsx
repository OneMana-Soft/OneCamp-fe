/**
 * The hub's spot illustrations, design v3 (hub.md S13, I2, I10): a tint disc
 * in the hue that names the place, the object on a raised tile at e2, one sun
 * dot and one brand spark. Spots entered the page as flat drawings; v3 gives
 * the object a surface, so it reads as a thing on the page rather than ink.
 *
 * Each is decorative (the heading beside it says what it means). The entrance
 * (`hub-pop-in` on the dots) plays once, and stands still under reduced
 * motion with everything else.
 */
import type { ReactNode } from "react"

import { cn } from "@/lib/utils/helpers/cn"
import type { CampHue } from "@/lib/campHue"

const SPARK = "M12 2.5c.5 4.6 2.9 7 9.5 9.5-6.6 2.5-9 4.9-9.5 9.5-.5-4.6-2.9-7-9.5-9.5 6.6-2.5 9-4.9 9.5-9.5z"

function Frame({ size, hue, children, className, label }: { size: number; hue: CampHue; children: ReactNode; className?: string; label: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden
      data-hub-spot={label}
      className={cn("shrink-0 overflow-visible", className)}
      style={{ ["--spot-tint" as string]: `var(--camp-${hue}-tint)`, ["--spot-hue" as string]: `var(--camp-${hue})` }}
    >
      <circle cx="48" cy="50" r="36" fill="var(--spot-tint)" />
      {children}
    </svg>
  )
}

/** The raised tile the object sits on: the raised surface with an e2-like drop. */
function RaisedTile({ x, y, w, h, r = 8 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <>
      <rect x={x} y={y + 2} width={w} height={h} rx={r} fill="var(--line-2)" />
      <rect x={x} y={y} width={w} height={h} rx={r} fill="var(--raised)" stroke="var(--line-2)" strokeWidth="1" />
    </>
  )
}

function Spark({ x, y, s = 0.42 }: { x: number; y: number; s?: number }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d={SPARK} fill="var(--brand)" />
}

/** Search found nothing: a magnifier on a lake disc. */
export function SpotSearchV3({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <Frame size={size} hue="lake" className={className} label="search">
      <RaisedTile x={26} y={28} w={44} h={44} r={12} />
      <circle cx="45" cy="47" r="9" stroke="var(--camp-lake-ink)" strokeWidth="3" />
      <path d="m51.5 53.5 7 7" stroke="var(--camp-lake-ink)" strokeWidth="3.4" strokeLinecap="round" />
      <circle className="hub-pop-in" style={{ ["--i" as string]: 0 }} cx="16" cy="70" r="3.5" fill="var(--camp-sun)" />
      <Spark x={72} y={8} />
    </Frame>
  )
}

/** The inbox: an envelope on a sky disc, a dashed orbit with a sun and a moss dot. */
export function SpotEnvelope({
  size = 120,
  hue = "sky",
  badge,
  className,
}: {
  size?: number
  hue?: CampHue
  /** "alert": a sun "!" at the flap (reconnect). "done": a moss check (inbox zero). */
  badge?: "alert" | "done"
  className?: string
}) {
  return (
    <Frame size={size} hue={hue} className={className} label={badge === "done" ? "inbox-zero" : badge === "alert" ? "reconnect" : "envelope"}>
      <circle cx="48" cy="50" r="44" stroke="var(--line-3)" strokeWidth="1.2" strokeDasharray="1.5 5" strokeLinecap="round" />
      <g className="hub-rise" style={{ ["--i" as string]: 1 }}>
        <RaisedTile x={24} y={34} w={48} h={34} r={7} />
        <path d="m25.5 37 22.5 16 22.5-16" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle className="hub-pop-in" style={{ ["--i" as string]: 0 }} cx="88" cy="40" r="3.5" fill="var(--camp-sun)" />
      <circle className="hub-pop-in" style={{ ["--i" as string]: 1 }} cx="10" cy="62" r="3" fill="var(--camp-moss)" />
      {badge === "alert" ? (
        <g className="hub-pop-in" style={{ ["--i" as string]: 2 }}>
          <circle cx="70" cy="34" r="8" fill="var(--camp-sun-tint)" stroke="var(--raised)" strokeWidth="2" />
          <path d="M70 30v4.5M70 37.5v.2" stroke="var(--camp-sun-ink)" strokeWidth="2" strokeLinecap="round" />
        </g>
      ) : null}
      {badge === "done" ? (
        <g className="hub-pop-in" style={{ ["--i" as string]: 2 }} data-spot-check="">
          <circle cx="70" cy="34" r="8" fill="var(--camp-moss)" stroke="var(--raised)" strokeWidth="2" />
          <path d="m66.5 34 2.5 2.5 4.5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
      <Spark x={74} y={4} />
    </Frame>
  )
}
