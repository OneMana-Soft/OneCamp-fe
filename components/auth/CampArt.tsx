"use client"

// The camp: the signed-out pages' and the first run's art (design v3,
// admin.md F1 and E1; DESIGN_V3 §3.15). A canvas of paper with the theme's
// ember glow, a dusk and a lake corner light and 2% grain; on it the logo's
// gradient ring with orbits round it, and on the orbits anonymous people (a
// gradient disc, never initials or a name: nothing on a customer's sign-in
// page pretends to be one of their members, owner decision D2) and one agent
// square. Decorative throughout: the words beside it say everything.

import * as React from "react"
import { useEffect, useId, useRef, useState } from "react"
import { type CampHue } from "@/lib/campHue"
import { personHue } from "@/lib/utils/getAvatarColor"
import { HUE_CLASS, SPARK_PATH, cx } from "@/components/ui/graphics"
import { ShieldCheck } from "@/lib/icons"

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
function AnonAvatar({ hue, r = 18 }: { hue: CampHue; r?: number }) {
  return (
    <g className={HUE_CLASS[hue]} data-anon-avatar="">
      <circle r={r + 2.5} fill="var(--sheet)" />
      <circle r={r} fill="var(--hue-a2)" />
      <circle r={r} fill="var(--hue-a1)" opacity=".6" />
    </g>
  )
}

/** The agent: a 32%-radius square in the agent gradient with the white spark. */
function AgentSquare({ s = 36 }: { s?: number }) {
  const h = s / 2
  return (
    <g data-agent-square="">
      <rect x={-h - 2.5} y={-h - 2.5} width={s + 5} height={s + 5} rx={(s + 5) * 0.32} fill="var(--sheet)" />
      <rect x={-h} y={-h} width={s} height={s} rx={s * 0.32} fill="var(--agent-a2, #5050B9)" />
      <rect x={-h} y={-h} width={s} height={s} rx={s * 0.32} fill="var(--agent-a1, #6572E4)" opacity=".6" />
      <path transform={`translate(${-s * 0.275} ${-s * 0.275}) scale(${(s * 0.55) / 24})`} d={SPARK_PATH} fill="#fff" />
    </g>
  )
}

/** One thing on an orbit: placed, kept upright while its orbit turns, popped in. */
function OnOrbit({ x, y, orbit, i, children }: { x: number; y: number; orbit: "outer" | "mid" | "inner"; i: number; children: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={`auth-upright-${orbit}`}>
        <g className="auth-pop" style={{ "--i": i } as React.CSSProperties}>
          {children}
        </g>
      </g>
    </g>
  )
}

const C = 260
// The inviter and you, as people: by name, or an address's name part (personHue).
const hueOf = (seed: string): CampHue => personHue(seed.includes("@") ? { user_email_id: seed } : seed)
const at = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return { x: +(C + r * Math.cos(a)).toFixed(1), y: +(C + r * Math.sin(a)).toFixed(1) }
}

/**
 * Pauses the orbits while the tab is hidden, and moves the composition up to
 * 6px with the pointer (rAF, transform only; never on touch, never under
 * reduced motion).
 */
function useHeroMotion(host: React.RefObject<HTMLElement | null>, layer: React.RefObject<HTMLElement | null>, reduced: boolean) {
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onVisibility = () => {
      if (document.hidden) el.setAttribute("data-paused", "")
      else el.removeAttribute("data-paused")
    }
    document.addEventListener("visibilitychange", onVisibility)
    let frame = 0
    let fine = false
    try {
      fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    } catch {
      fine = false
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !layer.current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect()
        if (!box.width || !layer.current) return
        const dx = ((e.clientX - box.left) / box.width - 0.5) * 12
        const dy = ((e.clientY - box.top) / box.height - 0.5) * 12
        const clamp = (v: number) => Math.max(-6, Math.min(6, v))
        layer.current.style.transform = `translate3d(${clamp(dx).toFixed(1)}px, ${clamp(dy).toFixed(1)}px, 0)`
      })
    }
    if (fine && !reduced) window.addEventListener("pointermove", onMove)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(frame)
    }
  }, [host, layer, reduced])
}

/** The workspace's address, as this page is on it. Empty until mounted (server render). */
export function useHost(): string {
  const [host, setHost] = useState("")
  useEffect(() => setHost(window.location.host), [])
  return host
}

/**
 * The sign-in hero's composition, 520px: the gradient ring at 88 with a
 * brand spark, three orbits (r 120 / 190 / 260, the middle dashed), five
 * anonymous people and an agent on them, four hue dots, and at most two chips
 * that state real claims. The orbits turn slowly (120 / 90 counter / 60s).
 */
export function CampHero({ host, chips = true, reduced: forced }: { host: string; chips?: boolean; reduced?: boolean }) {
  const ownReduced = useReducedMotion()
  const reduced = forced ?? ownReduced
  const hostRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  useHeroMotion(hostRef, layerRef, reduced)
  const people: Array<{ hue: CampHue; orbit: "outer" | "mid" | "inner"; r: number; deg: number }> = [
    { hue: "sky", orbit: "outer", r: 250, deg: -90 },
    { hue: "moss", orbit: "outer", r: 250, deg: 8 },
    { hue: "berry", orbit: "outer", r: 250, deg: 133 },
    { hue: "dusk", orbit: "mid", r: 190, deg: -135 },
    { hue: "sun", orbit: "inner", r: 120, deg: 112 },
  ]
  const agent = at(190, 10)
  return (
    <div ref={hostRef} className="auth-hero" data-camp-hero="" data-reduced={reduced ? "" : undefined}>
      <div ref={layerRef} className="auth-parallax" style={{ width: "100%", height: "100%" }}>
        <svg width="520" height="520" viewBox="0 0 520 520" style={{ width: "100%", height: "100%" }} aria-hidden="true">
          <g className="auth-rings" fill="none">
            <circle className="auth-orbit" cx={C} cy={C} r="120" strokeWidth="1.5" />
            <circle className="auth-orbit" cx={C} cy={C} r="190" strokeWidth="1.5" strokeDasharray="1.5 6" strokeLinecap="round" />
            <circle className="auth-orbit" cx={C} cy={C} r="250" strokeWidth="1.5" />
          </g>
          <g transform={`translate(${C - 44} ${C - 44})`}>
            <GradientRing size={88} stroke={6} />
          </g>
          <path transform="translate(300 196) scale(1.1)" d={SPARK_PATH} fill="var(--brand)" data-brand-spark="" />
          {(["outer", "mid", "inner"] as const).map((orbit) => (
            <g key={orbit} className={`auth-rot-${orbit}`}>
              {people.map((p, i) =>
                p.orbit === orbit ? (
                  <OnOrbit key={p.hue} {...at(p.r, p.deg)} orbit={orbit} i={i}>
                    <AnonAvatar hue={p.hue} />
                  </OnOrbit>
                ) : null,
              )}
              {orbit === "mid" && (
                <OnOrbit {...agent} orbit="mid" i={5}>
                  <AgentSquare />
                </OnOrbit>
              )}
              {orbit === "outer" && (
                <>
                  <circle cx={at(250, -45).x} cy={at(250, -45).y} r="5" fill="var(--camp-sun)" data-hue-dot="" />
                  <circle cx={at(250, 200).x} cy={at(250, 200).y} r="4" fill="var(--camp-lake)" data-hue-dot="" />
                </>
              )}
              {orbit === "mid" && (
                <>
                  <circle cx={at(190, 60).x} cy={at(190, 60).y} r="4" fill="var(--camp-sky)" data-hue-dot="" />
                  <circle cx={at(190, -60).x} cy={at(190, -60).y} r="4.5" fill="var(--camp-berry)" data-hue-dot="" />
                </>
              )}
            </g>
          ))}
        </svg>
      </div>
      {chips && (
        <>
          <div className="auth-chip" style={{ left: -8, top: 8 }} data-claim="server">
            <span className="auth-chip-tile hue-moss bg-hue-tint text-hue-ink">
              <ShieldCheck aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Your server</span>
              <span className="auth-chip-sub block truncate" translate="no">
                {host}
              </span>
            </span>
          </div>
          <div className="auth-chip" style={{ right: -8, bottom: 16 }} data-claim="agents">
            <svg width="28" height="28" viewBox="-14 -14 28 28" aria-hidden="true" className="flex-none">
              <AgentSquare s={24} />
            </svg>
            <span>
              <span className="block font-semibold">Agents act only as the people they work for</span>
              <span className="auth-chip-sub block">Every action is on the record</span>
            </span>
          </div>
        </>
      )}
    </div>
  )
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

/**
 * The first run's camp (E1, E3): before anyone arrives a grey outline ring
 * at 96 on three empty dashed orbits; lit, the gradient ring ignites over it;
 * with `people`, each address becomes a gradient avatar (initials from the
 * address: these are real people the admin just typed) on a slowly turning
 * orbit.
 */
export function FirstRunCamp({
  lit,
  instant,
  caption,
  people = [],
  preview,
}: {
  lit?: boolean
  instant?: boolean
  /** The theme a swatch previews, to fade the glow in again as it changes. */
  preview?: string | null
  caption?: React.ReactNode
  people?: Array<{ key: string; hue: CampHue; initials: string }>
}) {
  const filled = people.length > 0
  return (
    <CampCanvas panel lit={lit} instant={instant} preview={preview}>
      <div className="auth-hero" data-first-run-camp="">
        <svg width="520" height="520" viewBox="0 0 520 520" style={{ width: "100%", height: "100%" }} aria-hidden="true">
          <g className="auth-rings" fill="none">
            {[120, 190, 250].map((r) => (
              <circle key={r} className={lit ? "auth-orbit" : "auth-orbit-empty"} cx={C} cy={C} r={r} strokeWidth="1.5" strokeDasharray={lit && r !== 190 ? undefined : "1.5 5"} strokeLinecap="round" />
            ))}
          </g>
          <g transform={`translate(${C - 48} ${C - 48})`}>
            <GradientRing size={96} grey stroke={6} />
          </g>
          <g className="auth-ignite" data-ignite="">
            <g transform={`translate(${C - 48} ${C - 48})`}>
              <GradientRing size={96} stroke={6} />
            </g>
          </g>
          {filled && (
            <g className="auth-rot-inner" data-orbit-people="">
              {people.slice(0, 12).map((p, i) => {
                const ring = i < 4 ? 120 : i < 8 ? 190 : 250
                const pos = at(ring, -90 + (i % 4) * 90 + (ring === 190 ? 45 : ring === 250 ? 20 : 0))
                return (
                  <g key={p.key} transform={`translate(${pos.x} ${pos.y})`}>
                    <g className="auth-upright-inner">
                      <g className="auth-pop" style={{ "--i": 0 } as React.CSSProperties}>
                        <g className={HUE_CLASS[p.hue]}>
                          <circle r="20.5" fill="var(--sheet)" />
                          <circle r="18" fill="var(--hue-a2)" />
                          <circle r="18" fill="var(--hue-a1)" opacity=".6" />
                          <text textAnchor="middle" dy="4.5" fontSize="13" fontWeight="600" fill="#fff">
                            {p.initials}
                          </text>
                        </g>
                      </g>
                    </g>
                  </g>
                )
              })}
            </g>
          )}
        </svg>
        {caption && (
          <p className="auth-caption absolute inset-x-0 text-center" style={{ bottom: -8 }} translate="no">
            {caption}
          </p>
        )}
      </div>
    </CampCanvas>
  )
}

/**
 * The sign-up hero (F5): the inviter on the inner orbit beside the gradient
 * ring (a real person, so a gradient avatar with initials at 44px), a dashed
 * line to an empty outline labelled "You": you are joining their camp. When
 * `joined`, "You" fills with your gradient and pops onto the orbit (≤800ms,
 * still under reduced motion).
 */
export function InviteHero({
  inviter,
  inviterInitials,
  you,
  youInitials,
  joined,
}: {
  inviter: string
  inviterInitials: string
  you: string
  youInitials: string
  joined: boolean
}) {
  const inviterAt = at(120, -150)
  const youAt = at(190, -20)
  const inviterHue = hueOf(inviter)
  const youHue = hueOf(you)
  return (
    <CampCanvas panel>
      <div className="auth-hero" data-invite-hero="">
        <svg width="520" height="520" viewBox="0 0 520 520" style={{ width: "100%", height: "100%" }} aria-hidden="true">
          <g className="auth-rings" fill="none">
            <circle className="auth-orbit" cx={C} cy={C} r="120" strokeWidth="1.5" />
            <circle className="auth-orbit" cx={C} cy={C} r="190" strokeWidth="1.5" strokeDasharray="1.5 6" strokeLinecap="round" />
            <circle className="auth-orbit" cx={C} cy={C} r="250" strokeWidth="1.5" />
          </g>
          <g transform={`translate(${C - 44} ${C - 44})`}>
            <GradientRing size={88} stroke={6} />
          </g>
          <path d={`M${inviterAt.x} ${inviterAt.y} L${youAt.x} ${youAt.y}`} stroke="var(--line-3)" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
          {inviter && (
            <g transform={`translate(${inviterAt.x} ${inviterAt.y})`} data-inviter="">
              <g className="auth-pop">
                <g className={HUE_CLASS[inviterHue]}>
                  <circle r="24.5" fill="var(--sheet)" />
                  <circle r="22" fill="var(--hue-a2)" />
                  <circle r="22" fill="var(--hue-a1)" opacity=".6" />
                  <text textAnchor="middle" dy="5.5" fontSize="16" fontWeight="600" fill="#fff">
                    {inviterInitials}
                  </text>
                </g>
              </g>
            </g>
          )}
          <g transform={`translate(${youAt.x} ${youAt.y})`} data-you={joined ? "joined" : "waiting"}>
            {joined ? (
              <g className="auth-pop" style={{ "--i": -2 } as React.CSSProperties}>
                <g className={HUE_CLASS[youHue]}>
                  <circle r="24.5" fill="var(--sheet)" />
                  <circle r="22" fill="var(--hue-a2)" />
                  <circle r="22" fill="var(--hue-a1)" opacity=".6" />
                  <text textAnchor="middle" dy="5.5" fontSize="16" fontWeight="600" fill="#fff">
                    {youInitials}
                  </text>
                </g>
              </g>
            ) : (
              <circle r="22" fill="var(--raised)" stroke="var(--line-3)" strokeWidth="1.5" strokeDasharray="3 4" />
            )}
            <text textAnchor="middle" y="44" fontSize="12" fontWeight="510" fill="var(--ink-2)">
              You
            </text>
          </g>
        </svg>
      </div>
    </CampCanvas>
  )
}
