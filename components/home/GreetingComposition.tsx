"use client"

/**
 * "The camp at this hour" (hub.md H3): Home's one colour moment, drawn from
 * real data.
 *
 *   1. a sky wash behind the rings in the hour's hue (sun, sky, dusk, lake);
 *   2. three rings round (196, 84), the middle one dashed;
 *   3. the logo ring as the core, on a brand-muted disc;
 *   4. a day arc with the sun travelling to now (a crescent after dark);
 *   5. orbiters: up to four people you meet or talk with today, the agent as
 *      a square, today's events as small dots in their calendar hue;
 *   6. one brand spark.
 *
 * On the first visit of a session it draws itself: rings 600ms, the core
 * springs, orbiters pop in, the sun travels to now, the spark twinkles once.
 * Then the two orbits turn (120s and 180s a turn, in opposite directions)
 * for a few turns and rest where they began, paused while the drawing is off
 * screen or the tab is hidden. Each ring, and each orbiter's counter-turn, is
 * a layer of its own that the compositor turns: a transform on an SVG group is
 * laid out and painted on the main thread every frame, and Home is open all
 * day. Reduced motion shows the last frame and never turns. Decorative:
 * aria-hidden.
 */
import { personHue } from "@/lib/utils/getAvatarColor"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

import { prefersReducedMotion } from "@/lib/reducedMotion"
import { hueFor, type CampHue } from "@/lib/campHue"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { SPARK_PATH } from "@/components/ui/graphics/motifs"
import { cn } from "@/lib/utils/helpers/cn"
import { ARC_PATH, arcAt, dayArcPoint, hueForHour, INNER_SLOTS, orbitPoint, OUTER_SLOTS } from "@/components/home/homeTime"

export interface CompositionPerson {
  id: string
  name: string
}

export interface CompositionEvent {
  id: string
  hue?: CampHue
}

export interface GreetingCompositionProps {
  people?: CompositionPerson[]
  /** The agent you use most, drawn as the agent square (no initials, ever). */
  agent?: boolean
  events?: CompositionEvent[]
  /** Play the entrance (the first visit of the session). */
  animate?: boolean
  variant?: "desktop" | "phone"
  now?: Date
  className?: string
}

const CX = 196
const CY = 84
/** Turns before each orbit rests: six minutes of each. */
const OUTER_TURNS = 3
const INNER_TURNS = 2
/** An orbiter's own layer: its drawing, centred, with room for its ring. */
const UPRIGHT = 32

/** Pauses the orbit while the drawing is off screen or the tab is hidden. Exported for its test. */
export function orbitPlayState(visible: boolean, hidden: boolean): "running" | "paused" {
  return visible && !hidden ? "running" : "paused"
}

function useOrbitPlayState(ref: React.RefObject<Element | null>, enabled: boolean) {
  const [visible, setVisible] = useState(true)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    let io: IntersectionObserver | undefined
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)))
      io.observe(el)
    }
    const onVis = () => setHidden(document.hidden)
    onVis()
    document.addEventListener("visibilitychange", onVis)
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [ref, enabled])
  return orbitPlayState(visible, hidden)
}

/** One person on the orbit: a saturated disc with white initials and a ring in the sheet. */
function Orbiter({ person, r, step, animate }: { person: CompositionPerson; r: number; step: number; animate: boolean }) {
  const h = personHue(person.name)
  return (
    <g data-orbiter="person" className={animate ? "hub-pop-in" : undefined} style={{ ["--i" as string]: step } as CSSProperties}>
      <circle r={r + 2.5} fill="var(--sheet)" />
      <circle r={r} fill={`var(--camp-${h}-a2)`} />
      <circle r={r} fill={`var(--camp-${h}-a1)`} opacity={0.55} />
      <text textAnchor="middle" dy={r * 0.27} fontSize={r * 0.73} fontWeight={600} fill="#fff" style={{ fontFamily: "var(--font-sans)" }}>
        {getNameInitials(person.name).slice(0, r < 10 ? 1 : 2)}
      </text>
    </g>
  )
}

function AgentOrbiter({ size, step, animate }: { size: number; step: number; animate: boolean }) {
  const half = size / 2
  const rx = size * 0.32
  return (
    <g data-orbiter="agent" className={animate ? "hub-pop-in" : undefined} style={{ ["--i" as string]: step } as CSSProperties}>
      <rect x={-half - 2.5} y={-half - 2.5} width={size + 5} height={size + 5} rx={rx + 2} fill="var(--sheet)" />
      <rect x={-half} y={-half} width={size} height={size} rx={rx} fill="var(--agent-a1)" />
      <path d={SPARK_PATH} transform={`translate(${-half * 0.58} ${-half * 0.58}) scale(${(size * 0.58) / 24})`} fill="#fff" />
    </g>
  )
}

export function GreetingComposition({
  people = [],
  agent = false,
  events = [],
  animate = false,
  variant = "desktop",
  now: nowProp,
  className,
}: GreetingCompositionProps) {
  const box = useRef<HTMLDivElement>(null)
  const sunRef = useRef<SVGGElement>(null)
  const [now] = useState(() => nowProp ?? new Date())
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const phone = variant === "phone"
  // The orbits turn on desktop only (battery), never with reduced motion, and
  // rest once their turns end: the layers then keep nothing for turning.
  const [rested, setRested] = useState(false)
  const orbiting = !phone && !reduced && !rested
  const play = useOrbitPlayState(box, orbiting)
  const sun = dayArcPoint(now)
  const wash = hueForHour(now.getHours())

  // The sun's travel, from the left horizon to now, as transforms sampled
  // along the arc (composited; no offset-distance keyframes).
  useEffect(() => {
    const el = sunRef.current
    if (!animate || phone || reduced || !el || typeof el.animate !== "function") return
    const frames = Array.from({ length: 13 }, (_, i) => {
      const p = arcAt((sun.t * i) / 12)
      return { transform: `translate(${p.x}px, ${p.y}px)` }
    })
    el.animate(frames, { duration: 900, delay: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" })
  }, [animate, phone, reduced, sun.t])

  if (phone) {
    // 96 x 96: rings 18/30/42, core 9, up to three orbiters at 18px, no arc, no orbit.
    const c = 48
    const shown = people.slice(0, agent ? 2 : 3)
    const slots = [-40, 130, 250]
    return (
      <svg viewBox="0 0 96 96" width={96} height={96} aria-hidden="true" data-greeting-composition="phone" className={cn("shrink-0 overflow-visible", className)}>
        <circle cx={c} cy={c} r={18} fill="var(--brand-muted)" />
        <g fill="none" strokeWidth={1.5}>
          <circle className={animate ? "hub-draw" : undefined} style={{ ["--i" as string]: 0 } as CSSProperties} cx={c} cy={c} r={18} stroke="var(--line-2)" pathLength={1} strokeDasharray={1} />
          <circle cx={c} cy={c} r={30} stroke="var(--line-3)" strokeDasharray="1.5 5" strokeLinecap="round" />
          <circle className={animate ? "hub-draw" : undefined} style={{ ["--i" as string]: 2 } as CSSProperties} cx={c} cy={c} r={42} stroke="var(--line-2)" pathLength={1} strokeDasharray={1} />
        </g>
        <circle cx={c} cy={c} r={9} fill="none" stroke="url(#hub-logo-ring-phone)" strokeWidth={4} />
        <defs>
          <linearGradient id="hub-logo-ring-phone" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF8A00" />
            <stop offset="1" stopColor="#FF3D00" />
          </linearGradient>
        </defs>
        {shown.map((p, i) => {
          const pt = orbitPoint(c, c, 42, slots[i])
          return (
            <g key={p.id} transform={`translate(${pt.x} ${pt.y})`}>
              <Orbiter person={p} r={9} step={i + 1} animate={animate} />
            </g>
          )
        })}
        {agent ? (
          <g transform={`translate(${orbitPoint(c, c, 42, slots[shown.length]).x} ${orbitPoint(c, c, 42, slots[shown.length]).y})`}>
            <AgentOrbiter size={16} step={shown.length + 1} animate={animate} />
          </g>
        ) : null}
      </svg>
    )
  }

  const outer = people.slice(0, agent ? 3 : 4)
  const agentSlot = OUTER_SLOTS[outer.length]
  const dots = events.slice(0, INNER_SLOTS.length)
  // A ring's turn, or an orbiter's counter-turn, on a layer of its own.
  const turn = (name: "hub-orbit" | "hub-orbit-back", seconds: number, turns: number, origin?: string): CSSProperties | undefined =>
    orbiting
      ? {
          animationName: name,
          animationDuration: `${seconds}s`,
          animationTimingFunction: "linear",
          animationIterationCount: turns,
          animationPlayState: play,
          transformOrigin: origin,
          willChange: "transform",
        }
      : undefined
  const layer = "absolute inset-0 overflow-visible"

  return (
    <div
      ref={box}
      aria-hidden="true"
      data-greeting-composition="desktop"
      data-orbit={orbiting ? play : "off"}
      data-wash={wash}
      className={cn("relative shrink-0", className)}
      style={{ width: 320, height: 168 }}
    >
      <svg viewBox="0 0 320 168" width={320} height={168} className={layer}>
        <defs>
          <linearGradient id="hub-logo-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF8A00" />
            <stop offset="1" stopColor="#FF3D00" />
          </linearGradient>
          <radialGradient id="hub-sky-wash">
            <stop offset="0" stopColor={`var(--camp-${wash})`} className="[stop-opacity:0.22] dark:[stop-opacity:0.16]" />
            <stop offset="1" stopColor={`var(--camp-${wash})`} stopOpacity={0} />
          </radialGradient>
        </defs>
        {/* 1. The hour's light: a radial, never a solid disc. */}
        <circle cx={CX} cy={CY} r={80} fill="url(#hub-sky-wash)" />
        {/* 4. The day arc behind the rings: travelled part solid, the rest dashed. */}
        <path d={ARC_PATH} fill="none" stroke="var(--line-3)" strokeWidth={1.5} strokeDasharray="2 5" strokeLinecap="round" />
        <path d={ARC_PATH} fill="none" stroke="var(--line-2)" strokeWidth={1.5} pathLength={1} strokeDasharray={`${sun.t} 1`} data-arc-done={sun.t.toFixed(2)} />
        {/* 3. The core's ground. */}
        <circle cx={CX} cy={CY} r={30} fill="var(--brand-muted)" />
        {/* 2. Rings. */}
        <g fill="none" strokeWidth={1.5}>
          <circle className={animate ? "hub-draw" : undefined} style={{ ["--i" as string]: 0 } as CSSProperties} cx={CX} cy={CY} r={30} stroke="var(--line-2)" pathLength={1} strokeDasharray={1} />
          <circle cx={CX} cy={CY} r={52} stroke="var(--line-3)" strokeDasharray="1.5 5" strokeLinecap="round" />
          <circle className={animate ? "hub-draw" : undefined} style={{ ["--i" as string]: 2 } as CSSProperties} cx={CX} cy={CY} r={74} stroke="var(--line-2)" pathLength={1} strokeDasharray={1} />
        </g>
        {/* 3. The logo ring, the brand mark's hero instance. */}
        <circle
          className={animate ? "hub-pop-in" : undefined}
          style={animate ? ({ animationDelay: "200ms" } as CSSProperties) : undefined}
          cx={CX}
          cy={CY}
          r={15}
          fill="none"
          stroke="url(#hub-logo-ring)"
          strokeWidth={6}
        />
      </svg>
      {/* 5. The outer orbit: people and the agent, each kept upright by a
          counter-turn of its own. */}
      <div
        data-orbit-ring="outer"
        className={layer}
        style={turn("hub-orbit", 120, OUTER_TURNS, `${CX}px ${CY}px`)}
        // Both orbits end together (six minutes each); the outer one says so.
        onAnimationEnd={(e) => e.target === e.currentTarget && setRested(true)}
      >
        {outer.map((p, i) => (
          <Upright key={p.id} at={orbitPoint(CX, CY, 74, OUTER_SLOTS[i])} style={turn("hub-orbit-back", 120, OUTER_TURNS)}>
            <Orbiter person={p} r={13} step={i + 1} animate={animate} />
          </Upright>
        ))}
        {agent && agentSlot !== undefined ? (
          <Upright at={orbitPoint(CX, CY, 74, agentSlot)} style={turn("hub-orbit-back", 120, OUTER_TURNS)}>
            <AgentOrbiter size={24} step={outer.length + 1} animate={animate} />
          </Upright>
        ) : null}
      </div>
      {/* The inner orbit: today's events, in their calendar hue. */}
      <div data-orbit-ring="inner" className={layer} style={turn("hub-orbit-back", 180, INNER_TURNS, `${CX}px ${CY}px`)}>
        <svg viewBox="0 0 320 168" width={320} height={168} className={layer}>
          {dots.map((ev, i) => {
            const pt = orbitPoint(CX, CY, 52, INNER_SLOTS[i])
            return (
              <circle
                key={ev.id}
                data-orbiter="event"
                className={animate ? "hub-pop-in" : undefined}
                style={{ ["--i" as string]: 5 + i } as CSSProperties}
                cx={pt.x}
                cy={pt.y}
                r={4 - i * 0.5}
                fill={`var(--camp-${ev.hue ?? hueFor(ev.id)})`}
              />
            )
          })}
        </svg>
      </div>
      <svg viewBox="0 0 320 168" width={320} height={168} className={layer}>
        {/* 6. One brand spark, top-left of the outer ring; it twinkles once. */}
        <g transform="translate(116 8) scale(0.42)">
          <path
            d={SPARK_PATH}
            fill="var(--brand)"
            style={animate ? ({ transformBox: "fill-box", transformOrigin: "center", animation: "hub-twinkle 1.2s var(--ease-in-out) 1.4s both" } as CSSProperties) : undefined}
          />
        </g>
        {/* The sun, or after dark a crescent in dusk. */}
        <g ref={sunRef} data-sun={sun.day ? "day" : "night"} style={{ transform: `translate(${sun.x}px, ${sun.y}px)` }}>
          <circle r={7.5} fill="var(--sheet)" />
          <circle r={5} fill={sun.day ? "var(--camp-sun)" : "var(--camp-dusk)"} />
          {!sun.day ? <circle r={4.2} cx={2.4} cy={-1.6} fill="var(--sheet)" /> : null}
        </g>
      </svg>
    </div>
  )
}

/** An orbiter on a layer of its own at a point of its ring, drawn round its centre. */
function Upright({ at, style, children }: { at: { x: number; y: number }; style?: CSSProperties; children: React.ReactNode }) {
  const half = UPRIGHT / 2
  return (
    <div data-counter-turn="" className="absolute" style={{ left: at.x - half, top: at.y - half, width: UPRIGHT, height: UPRIGHT, ...style }}>
      <svg viewBox={`${-half} ${-half} ${UPRIGHT} ${UPRIGHT}`} width={UPRIGHT} height={UPRIGHT} className="overflow-visible">
        {children}
      </svg>
    </div>
  )
}
