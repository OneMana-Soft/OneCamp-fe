/**
 * The celebration burst and the springy check (the playful layer, "Motion").
 *
 * celebrate(el) is for the few moments worth it: a task done, a first message,
 * an import finished, a checklist completed. Never for routine actions, or it
 * stops meaning anything. 6 to 10 camp-hued sparks leave the element's centre
 * and fade within 300 to 500 ms. springPop(el) is the 1 -> 1.12 -> 1 bounce of
 * a check that has just been ticked.
 *
 * Both are Web Animations on elements appended for the purpose, so there is no
 * dependency, nothing re-renders, and nothing is left in the page. Both do
 * nothing at all for someone who asked for reduced motion, and nothing where
 * the browser has no Web Animations.
 */
import { CAMP_HUES } from "@/lib/campHue"
import { feedback, type FeedbackKind } from "@/lib/ui/feedback"
import { localDay } from "@/lib/utils/timeZone"

/** A four-point spark, the motif's (components/ui/graphics/Spark). */
const SPARK = "M5 0Q5.6 4.4 10 5Q5.6 5.6 5 10Q4.4 5.6 0 5Q4.4 4.4 5 0Z"
const SVG = "http://www.w3.org/2000/svg"
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"

/** True when there is no window to animate in, or the person asked for less motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export interface CelebrateOptions {
  /** How many sparks, 6 to 10 (8 by default); 3 to 10 for a small burst. */
  count?: number
  /** One hue for every spark (the record's moss-only "Prove it"), instead of the camp hues in turn. */
  hue?: (typeof CAMP_HUES)[number]
  /**
   * A small burst: how far the sparks travel, in px, all at one 6px size
   * (design v3 chat: your first reaction on a message, three sparks, 14px).
   * Without it, the full burst reaches 22, 29 and 36px.
   */
  reach?: number
}

/**
 * Bursts camp-hued sparks from the middle of `el`. Returns how many it
 * launched: 0 when it did nothing (no element, reduced motion, no Web
 * Animations).
 *
 *   onClick={(e) => { if (!done) celebrate(e.currentTarget); complete() }}
 */
export function celebrate(el: Element | null | undefined, { count = 8, hue: only, reach: smallReach }: CelebrateOptions = {}): number {
  if (!el || typeof document === "undefined" || prefersReducedMotion()) return 0
  const layer = document.createElement("div")
  if (typeof layer.animate !== "function") return 0

  const n = Math.min(10, Math.max(smallReach ? 3 : 6, Math.round(count)))
  const box = el.getBoundingClientRect()
  layer.setAttribute("aria-hidden", "true")
  layer.setAttribute("data-celebrate", "")
  layer.style.cssText = [
    "position:fixed",
    `left:${box.left + box.width / 2}px`,
    `top:${box.top + box.height / 2}px`,
    "width:0",
    "height:0",
    "pointer-events:none",
    "z-index:var(--z-toast, 800)",
  ].join(";")
  document.body.appendChild(layer)

  const animations: Animation[] = []
  for (let i = 0; i < n; i++) {
    const hue = only ?? CAMP_HUES[i % CAMP_HUES.length]
    // Evenly round the circle, nudged off the grid so it reads as a burst,
    // not a clock face; three reaches and two sizes for depth.
    const angle = (i / n) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12) - Math.PI / 2
    const reach = smallReach ?? 22 + (i % 3) * 7
    const size = smallReach ? 6 : i % 3 === 1 ? 6 : 9
    const dx = Math.cos(angle) * reach
    const dy = Math.sin(angle) * reach
    const spark = document.createElementNS(SVG, "svg")
    spark.setAttribute("viewBox", "0 0 10 10")
    spark.setAttribute("width", String(size))
    spark.setAttribute("height", String(size))
    spark.style.cssText = `position:absolute;left:${-size / 2}px;top:${-size / 2}px;fill:var(--camp-${hue});overflow:visible`
    const path = document.createElementNS(SVG, "path")
    path.setAttribute("d", SPARK)
    spark.appendChild(path)
    layer.appendChild(spark)
    animations.push(
      spark.animate(
        [
          { transform: "translate(0, 0) scale(0.4) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx * 0.8}px, ${dy * 0.8}px) scale(1) rotate(45deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.6) rotate(90deg)`, opacity: 0 },
        ],
        // 300 to 500 ms, staggered so the sparks do not land as one.
        { duration: 300 + ((i * 53) % 201), easing: EASE, fill: "forwards" },
      ),
    )
  }

  let removed = false
  const remove = () => {
    if (removed) return
    removed = true
    layer.remove()
  }
  Promise.all(animations.map((a) => a.finished)).then(remove, remove)
  // A safety net: an animation the tab paused would otherwise leave the layer.
  window.setTimeout(remove, 700)
  return n
}

/**
 * The springy check: 1 -> 1.12 -> 1 over 220 ms on the house curve. For an
 * element the click itself changed; a check that was already ticked when the
 * page loaded never bounces. Returns the animation, or null when it did nothing.
 */
export function springPop(el: Element | null | undefined): Animation | null {
  if (!el || prefersReducedMotion() || typeof (el as HTMLElement).animate !== "function") return null
  return (el as HTMLElement).animate([{ scale: "1" }, { scale: "1.12", offset: 0.45 }, { scale: "1" }], {
    duration: 220,
    easing: EASE,
  })
}

/**
 * The day's one celebration for a surface (hub.md §1.1, `celebrate`): the guide
 * finished, needs-me cleared, inbox zero, the first "Prove it" pass. It bursts
 * at most once per key per day (`celebrated:<key>:<yyyy-mm-dd>`), or once ever
 * with `daily: false`. Returns what celebrate() returned, 0 when it was spent,
 * when motion is reduced, or when storage refuses (a private window): a burst
 * that could repeat on every load is worse than none.
 */
export function celebrateOnce(
  key: string,
  el: Element | null | undefined,
  { daily = true, now = new Date(), ...opts }: CelebrateOptions & { daily?: boolean; now?: Date } = {},
): number {
  if (!el || prefersReducedMotion()) return 0
  const storageKey = daily ? `celebrated:${key}:${localDay(now)}` : `celebrated:${key}`
  try {
    if (window.localStorage.getItem(storageKey)) return 0
    window.localStorage.setItem(storageKey, "1")
  } catch {
    return 0
  }
  return celebrate(el, opts)
}

/*
 * THE WORK AREA'S THREE TIERS (work.md W04). Nothing else in the area
 * celebrates: components/task/celebrateCallers.test.ts holds the callers to
 * a list. Never on load, a teammate's or an agent's change arriving live, a
 * bulk change, an import or an undo.
 */

const coarse = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches
// The tiers' buzz goes through feedback() (mobile F3), vibration only: the
// sparks are the visual. A spark is a selection tick, a ring an impact, the
// Camp moment a success.
const buzz = (kind: FeedbackKind) => {
  if (coarse()) feedback(kind)
}

let lastSpark = 0

/**
 * Spark: a task or subtask finished by this click or drop. 8 sparks from the
 * check or card; a second finish within 2 s gets 6 and no buzz, so a streak
 * of ticks feels lively, not noisy.
 */
export function celebrateTask(el: Element | null | undefined): number {
  const now = Date.now()
  const streak = now - lastSpark < 2000
  lastSpark = now
  if (!streak) buzz("selection")
  return celebrate(el, { count: streak ? 6 : 8 })
}

/** Whether this person finished something in the last few seconds: a bigger finish that follows is theirs. */
export function sparkedRecently(withinMs = 4000): boolean {
  return lastSpark > 0 && Date.now() - lastSpark < withinMs
}

/** Ring: the last open subtask of a task ticked, or a cycle's last task done. 10 sparks from the bar's end. */
export function celebrateRing(el: Element | null | undefined): number {
  buzz("impact")
  return celebrate(el, { count: 10 })
}

const CELEBRATED = "oc_celebrated"

/** Whether this person has had the Camp moment for this project or goal. */
export function hasCelebrated(kind: "project" | "goal" | "cycle", uuid: string): boolean {
  try {
    return window.localStorage.getItem(`${CELEBRATED}:${kind}:${uuid}`) === "1"
  } catch {
    return false
  }
}

/**
 * Camp: a project reaches 100 % of its tasks done by this person's action, or
 * a goal reaches its target. Once per person, remembered: two rings leave the
 * finished ring and fade, with 10 sparks. Returns false when this person has
 * had it already, so the caller says nothing; true when it is theirs now
 * (the caller shows the one-line toast, which reduced motion keeps).
 */
export function celebrateCamp(el: Element | null | undefined, kind: "project" | "goal" | "cycle", uuid: string): boolean {
  if (!uuid || hasCelebrated(kind, uuid)) return false
  try {
    window.localStorage.setItem(`${CELEBRATED}:${kind}:${uuid}`, "1")
  } catch {
    /* private mode: it may repeat, which is harmless */
  }
  buzz("success")
  if (el && !prefersReducedMotion() && typeof document !== "undefined") {
    const box = el.getBoundingClientRect()
    for (let i = 0; i < 2; i++) {
      const ring = document.createElement("div")
      if (typeof ring.animate !== "function") break
      ring.setAttribute("aria-hidden", "true")
      ring.setAttribute("data-celebrate", "")
      ring.style.cssText = [
        "position:fixed",
        `left:${box.left + box.width / 2 - 32}px`,
        `top:${box.top + box.height / 2 - 32}px`,
        "width:64px",
        "height:64px",
        "border-radius:50%",
        "box-shadow:inset 0 0 0 1.5px var(--line-2)",
        "pointer-events:none",
        "z-index:var(--z-toast, 800)",
      ].join(";")
      document.body.appendChild(ring)
      const a = ring.animate([{ transform: "scale(1)", opacity: 0.9 }, { transform: "scale(1.6)", opacity: 0 }], {
        duration: 600,
        delay: i * 140,
        easing: EASE,
        fill: "both",
      })
      const remove = () => ring.remove()
      a.finished.then(remove, remove)
      window.setTimeout(remove, 1000)
    }
  }
  celebrate(el, { count: 10 })
  return true
}
