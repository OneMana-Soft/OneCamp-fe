"use client"

// The camp's heroes beside a form (design v3, admin.md F1, F5 and E1): the
// sign-in hero, the first run's camp and the sign-up hero. Their own file, so
// the signed-out pages without one (forgot password, reset, unsubscribe and
// the rest) carry only the canvas and the band (CampArt).

import * as React from "react"
import { useEffect, useRef } from "react"
import { type CampHue } from "@/lib/campHue"
import { personHue } from "@/lib/utils/getAvatarColor"
import { HUE_CLASS, SPARK_PATH } from "@/components/ui/graphics"
import { ShieldCheck } from "@/lib/icons"
import { AnonAvatar, CampCanvas, GradientRing, useReducedMotion } from "@/components/auth/CampArt"

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

/**
 * The sign-in hero, 520px: the gradient ring and spark on three orbits (the
 * middle dashed), five anonymous people and an agent, four hue dots, and at
 * most two chips of real claims: `server` names where it runs (none until
 * known), with a `shield` where the trust line has one.
 */
export function CampHero({ host, server, shield, chips = true, reduced: forced }: { host: string; server?: string; shield?: boolean; chips?: boolean; reduced?: boolean }) {
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
          {server && (
            <div className={`auth-chip${shield ? "" : " pl-3"}`} style={{ left: -8, top: 8 }} data-claim="server">
              {shield && <span className="auth-chip-tile hue-moss bg-hue-tint text-hue-ink"><ShieldCheck aria-hidden="true" /></span>}
              <span className="min-w-0">
                <span className="block font-semibold">{server}</span>
                <span className="auth-chip-sub block truncate" translate="no">
                  {host}
                </span>
              </span>
            </div>
          )}
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
